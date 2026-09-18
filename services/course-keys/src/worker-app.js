import Fastify from "fastify";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { target, helperInvocation, checkedResponse } from "./targets.js";
import {
  AppError,
  fail,
  id,
  nowIso,
  requestId,
  publicKey,
  forbidExtra,
} from "./security.js";
export function createHelper(config) {
  return {
    run(request) {
      const invocation = helperInvocation(config, request);
      return new Promise((resolve, reject) => {
        const child = spawn(invocation.command, invocation.args, {
          stdio: ["pipe", "pipe", "pipe"],
          shell: false,
          env: { PATH: "/usr/sbin:/usr/bin:/sbin:/bin", LANG: "C.UTF-8" },
        });
        let stdout = "",
          bytes = 0,
          settled = false;
        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          error ? reject(error) : resolve(value);
        };
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          finish(new Error("Helper timed out"));
        }, 20_000);
        child.on("error", () => finish(new Error("Helper unavailable")));
        child.stdout.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > 64 * 1024) {
            child.kill("SIGKILL");
            finish(new Error("Helper response too large"));
          } else stdout += chunk;
        });
        child.stderr.resume();
        child.on("close", () => {
          try {
            const response = JSON.parse(stdout);
            checkedResponse(request, response);
            finish(null, response);
          } catch {
            finish(new Error("Invalid helper response"));
          }
        });
        child.stdin.on("error", () => {});
        child.stdin.end(JSON.stringify(request));
      });
    },
  };
}
export async function createWorker(options = {}) {
  const config = options.config || loadConfig(process.env, "worker"),
    db = options.db || openDatabase(config.importerDbPath, true),
    helper = options.helper || createHelper(config);
  const runHelper = async (request) => checkedResponse(request, await helper.run(request));
  async function probeMany(values, operation) {
    const results = new Array(values.length), unavailable = new Map();
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(8, values.length) }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= values.length) return;
        const destination = target(values[index]);
        if (unavailable.has(destination.serverId)) {
          results[index] = { error: unavailable.get(destination.serverId) };
          continue;
        }
        try { results[index] = { response: await runHelper({ operation, ...destination }) }; }
        catch (error) { unavailable.set(destination.serverId, error); results[index] = { error }; }
      }
    }));
    return results;
  }
  const app = Fastify({
    logger: false,
    bodyLimit: 8 * 1024 * 1024,
    requestTimeout: 60_000,
  });
  app.decorate("db", db);
  app.decorate("config", config);
  app.setErrorHandler((e, req, reply) =>
    reply
      .code(
        e instanceof AppError ? e.statusCode : e.statusCode === 413 ? 413 : 500,
      )
      .send({
        error: {
          code: e instanceof AppError ? e.code : "IMPORTER_ERROR",
          message: e instanceof AppError ? e.message : "导入执行服务暂时不可用",
        },
      }),
  );
  function view(jobId) {
    const job = db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId);
    if (!job) fail("JOB_NOT_FOUND", "导入任务不存在", 404);
    const tasks = db
        .prepare("SELECT * FROM tasks WHERE job_id=? ORDER BY id")
        .all(jobId),
      statuses = tasks.map((t) => t.status);
    const status = statuses.includes("running")
      ? "running"
      : statuses.includes("queued")
        ? "queued"
        : statuses.every((x) => x === "success")
          ? "completed"
          : statuses.some((x) => x === "success")
            ? "partial"
            : "failed";
    return {
      id: job.id,
      status,
      createdAt: job.created_at,
      items: tasks.map((t) => ({
        studentId: t.student_id,
        serverId: t.server_id,
        username: t.username,
        action: t.action,
        status: t.status,
        fingerprint: t.fingerprint,
        error: t.error,
        generation: t.generation,
      })),
    };
  }
  function validate(body) {
    forbidExtra(body, ["requestId", "items"]);
    requestId(body.requestId);
    if (
      !Array.isArray(body.items) ||
      !body.items.length ||
      body.items.length > 2000
    )
      fail("INVALID_ITEMS", "导入任务必须包含 1 至 2000 位学生");
    const seen = new Set();
    return body.items.map((item) => {
      forbidExtra(item, ["studentId", "serverId", "username", "action", "publicKey", "fingerprint"]);
      const destination = target(item);
      const sid = destination.studentId;
      if (seen.has(sid)) fail("DUPLICATE_STUDENT", "同一任务不能重复包含学生");
      seen.add(sid);
      if (!["install", "revoke"].includes(item.action))
        fail("INVALID_ACTION", "导入动作无效");
      if (item.action === "install") {
        const key = publicKey(item.publicKey);
        if (
          item.publicKey !== key.publicKey ||
          item.fingerprint !== key.fingerprint
        )
          fail("INVALID_KEY", "公钥及指纹必须为一致的标准格式");
        return {
          ...destination,
          action: "install",
          publicKey: key.publicKey,
          fingerprint: key.fingerprint,
        };
      }
      if (
        item.publicKey !== null ||
        typeof item.fingerprint !== "string" ||
        !/^SHA256:[A-Za-z0-9+/]{43}$/.test(item.fingerprint)
      )
        fail("INVALID_REVOKE", "撤销请求必须指定当前公钥指纹");
      return {
        ...destination,
        action: "revoke",
        publicKey: null,
        fingerprint: item.fingerprint,
      };
    });
  }
  let serial = Promise.resolve(),
    running = null,
    closed = false;
  const serialized = (fn) => {
    const result = serial.then(fn);
    serial = result.catch(() => {});
    return result;
  };
  async function submit(body) {
    const items = validate(body),
      payload = JSON.stringify(items);
    return serialized(async () => {
      const previous = db
        .prepare("SELECT * FROM jobs WHERE request_id=?")
        .get(body.requestId);
      if (previous) {
        if (previous.payload !== payload)
          fail("IDEMPOTENCY_CONFLICT", "请求标识已用于不同导入内容", 409);
        return view(previous.id);
      }
      const probes = await probeMany(items, "status");
      const generations = probes.map(({ response }) => response?.ok ? response.generation : 0);
      const jobId = id();
      db.transaction(() => {
        db.prepare(
          "INSERT INTO jobs(id,request_id,payload,created_at) VALUES(?,?,?,?)",
        ).run(jobId, body.requestId, payload, nowIso());
        for (const [i, item] of items.entries()) {
          const local =
            db
              .prepare("SELECT generation FROM targets WHERE server_id=? AND username=?")
              .get(item.serverId, item.username)?.generation || 0;
          const generation = Math.max(local, generations[i]) + 1;
          if (!Number.isSafeInteger(generation))
            fail("GENERATION_EXHAUSTED", "账号版本超出允许范围", 409);
          db.prepare(
            "INSERT INTO targets(server_id,username,student_id,generation) VALUES(?,?,?,?) ON CONFLICT(server_id,username) DO UPDATE SET generation=excluded.generation",
          ).run(item.serverId, item.username, item.studentId, generation);
          db.prepare(
            "INSERT INTO tasks(job_id,student_id,server_id,username,action,public_key,fingerprint,generation) VALUES(?,?,?,?,?,?,?,?)",
          ).run(
            jobId,
            item.studentId,
            item.serverId,
            item.username,
            item.action,
            item.publicKey,
            item.fingerprint,
            generation,
          );
        }
      }).immediate();
      queueMicrotask(() => void processJobs());
      return view(jobId);
    });
  }
  function errorMessage(response) {
    return response?.error?.message || "远端账号或授权文件检查失败";
  }
  async function execute(task) {
    db.prepare("UPDATE tasks SET status='running',error=NULL WHERE id=?").run(
      task.id,
    );
    let state;
    try {
      state = await runHelper({
        operation: "status",
        studentId: task.student_id,
        serverId: task.server_id,
        username: task.username,
      });
    } catch {
      return db
        .prepare("UPDATE tasks SET status='failed',error=? WHERE id=?")
        .run("无法读取远端状态，请检查执行服务后重试", task.id);
    }
    if (!state.ok)
      return db
        .prepare("UPDATE tasks SET status='failed',error=? WHERE id=?")
        .run(errorMessage(state), task.id);
    const expectedFingerprint =
      task.action === "revoke" ? null : task.fingerprint;
    if (state.generation > task.generation)
      return db
        .prepare("UPDATE tasks SET status='superseded',error=? WHERE id=?")
        .run("远端已有更高版本，已拒绝旧任务", task.id);
    if (state.generation === task.generation) {
      if (
        state.action === task.action &&
        state.fingerprint === expectedFingerprint
      )
        return db
          .prepare("UPDATE tasks SET status='success',error=NULL WHERE id=?")
          .run(task.id);
      return db
        .prepare("UPDATE tasks SET status='failed',error=? WHERE id=?")
        .run("同一版本对应不同远端状态，已拒绝写入", task.id);
    }
    if (
      task.action === "revoke" &&
      state.action === "install" &&
      state.fingerprint !== task.fingerprint
    )
      return db
        .prepare("UPDATE tasks SET status='failed',error=? WHERE id=?")
        .run("当前公钥与助教确认的撤销对象不同，请重新预览", task.id);
    let applied;
    try {
      applied = await runHelper({
        operation: "apply",
        studentId: task.student_id,
        serverId: task.server_id,
        username: task.username,
        action: task.action,
        generation: task.generation,
        publicKey: task.public_key,
        fingerprint: expectedFingerprint,
        ...(task.action === "revoke"
          ? { expectedFingerprint: task.fingerprint }
          : {}),
      });
    } catch {
      try {
        const actual = await runHelper({
          operation: "status",
          studentId: task.student_id,
        serverId: task.server_id,
        username: task.username,
        });
        if (
          actual.ok &&
          actual.generation === task.generation &&
          actual.action === task.action &&
          actual.fingerprint === expectedFingerprint
        )
          return db
            .prepare("UPDATE tasks SET status='success',error=NULL WHERE id=?")
            .run(task.id);
      } catch {}
      return db
        .prepare("UPDATE tasks SET status='failed',error=? WHERE id=?")
        .run("执行结果未确认，请检查状态后重试", task.id);
    }
    if (!applied.ok)
      return db
        .prepare("UPDATE tasks SET status=?,error=? WHERE id=?")
        .run(
          applied.error?.code === "STALE_GENERATION" ? "superseded" : "failed",
          errorMessage(applied),
          task.id,
        );
    let verified;
    try {
      verified = await runHelper({
        operation: "status",
        studentId: task.student_id,
        serverId: task.server_id,
        username: task.username,
      });
    } catch {
      return db
        .prepare("UPDATE tasks SET status='failed',error=? WHERE id=?")
        .run("写入后核验失败，请重试以重新核对状态", task.id);
    }
    if (
      !verified.ok ||
      verified.generation !== task.generation ||
      verified.action !== task.action ||
      verified.fingerprint !== expectedFingerprint
    )
      return db
        .prepare("UPDATE tasks SET status='failed',error=? WHERE id=?")
        .run("远端写入后的状态与预期不一致", task.id);
    db.prepare("UPDATE tasks SET status='success',error=NULL WHERE id=?").run(
      task.id,
    );
  }
  async function processJobs() {
    if (closed) return;
    if (running) return running;
    // Each server has its own serial lane: failures on one host cannot stall the others.
    running = Promise.all(config.servers.map(({ id: serverId }) => (async () => {
      let task;
      while (!closed && (task = db.prepare(
        "SELECT * FROM tasks WHERE server_id=? AND status IN ('queued','running') ORDER BY id LIMIT 1"
      ).get(serverId))) {
        try { await execute(task); }
        catch {
          db.prepare("UPDATE tasks SET status='failed',error=? WHERE id=?")
            .run("导入执行失败，请检查服务后重试", task.id);
        }
      }
    })())).finally(() => { running = null; });
    return running;
  }
  app.get("/health", async () => ({ ok: true }));
  app.post("/check", async (req) => {
    forbidExtra(req.body, ["targets"]);
    if (!Array.isArray(req.body.targets) || !req.body.targets.length || req.body.targets.length > 2000)
      fail("INVALID_TARGETS", "请选择 1 至 2000 个学生账号");
    const seen = new Set();
    const targets = req.body.targets.map((value) => {
      forbidExtra(value, ["studentId", "serverId", "username"]);
      const destination = target(value);
      const key = destination.serverId + ":" + destination.username;
      if (seen.has(key)) fail("DUPLICATE_TARGET", "不能重复检查同一账号");
      seen.add(key);
      return destination;
    });
    const probes = await probeMany(targets, "check");
    const accounts = targets.map((destination, index) => {
      const { response: result, error } = probes[index];
      if (error) return { ...destination, status: "error",
        message: error instanceof AppError ? error.message : "账号检查执行服务不可用" };
      return { ...destination,
        status: ["ready", "missing", "unauthorized", "error"].includes(result.accountStatus)
          ? result.accountStatus : "error",
        message: result.error?.message || null };
    });
    return { accounts };
  });
  app.post("/jobs", async (req) => submit(req.body));
  app.get("/jobs/:id", async (req) => view(req.params.id));
  app.decorate("processJobs", processJobs);
  app.decorate("submit", submit);
  const timer = setInterval(() => void processJobs(), config.pollMs);
  timer.unref();
  app.addHook("onReady", async () => {
    queueMicrotask(() => void processJobs());
  });
  app.addHook("onClose", async () => {
    closed = true;
    clearInterval(timer);
    await serial;
    if (running) await running;
    if (!options.db) db.close();
  });
  return app;
}
export async function listenWorker(app) {
  const socket = app.config.importerSocket;
  fs.mkdirSync(path.dirname(socket), { recursive: true, mode: 0o750 });
  if (fs.existsSync(socket)) {
    const stat = fs.lstatSync(socket);
    if (!stat.isSocket())
      throw new Error("Refusing to replace a non-socket path");
    const active = await new Promise((resolve, reject) => {
      const connection = net.createConnection(socket);
      connection.once("connect", () => {
        connection.destroy();
        resolve(true);
      });
      connection.once("error", (e) => {
        if (["ECONNREFUSED", "ENOENT"].includes(e.code)) resolve(false);
        else reject(e);
      });
    });
    if (active) throw new Error("Importer socket is already active");
    fs.unlinkSync(socket);
  }
  await app.listen({ path: socket });
  fs.chmodSync(socket, 0o660);
}
