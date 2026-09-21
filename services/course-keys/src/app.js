import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import crypto from "node:crypto";
import { Transform } from "node:stream";
import { loadConfig, canStudentEnroll, enrollmentMode } from "./config.js";
import { openDatabase, audit, rate, hasUncertainDeployment } from "./db.js";
import {
  AppError,
  fail,
  id,
  token,
  nowIso,
  digest,
  safeEqual,
  studentId,
  selectedIds,
  requestId,
  publicKey,
  forbidExtra,
} from "./security.js";
import { parseRoster, workbookBuffer, HEADERS } from "./roster.js";
import { createMailer } from "./mail.js";
import { createImporterClient } from "./importer-client.js";
import { autoImportSettings, autoImportView, recordAutoImport, cancelAutoImport, changeAutoImportSettings, createAutoImporter } from "./auto-import.js";
const PREFIX = "/api/course-keys";
export async function createApp(options = {}) {
  const config = options.config || loadConfig();
  const db = options.db || openDatabase(config.dbPath);
  const mailer = options.mailer || createMailer(config);
  const importer = options.importer || createImporterClient(config);
  const app = Fastify({
    logger: false,
    bodyLimit: 64 * 1024,
    trustProxy: config.trustProxy,
    requestTimeout: 30_000,
  });
  app.decorate("db", db);
  app.decorate("config", config);
  await app.register(cookie);
  await app.register(multipart, {
    limits: {
      fileSize: 4096,
      files: 1,
      fields: 1,
      parts: 2,
      fieldSize: 64,
      fieldNameSize: 64,
      headerPairs: 30,
    },
  });
  app.setErrorHandler((error, req, reply) => {
    const status =
      error instanceof AppError
        ? error.statusCode
        : [400, 401, 403, 404, 405, 406, 408, 413, 415, 429].includes(
              error.statusCode,
            )
          ? error.statusCode
          : error.validation
            ? 400
            : 500;
    reply.code(status).send({
      error: {
        code:
          error instanceof AppError
            ? error.code
            : status === 413
              ? "PAYLOAD_TOO_LARGE"
              : status < 500
                ? "INVALID_REQUEST"
                : "INTERNAL_ERROR",
        message:
          error instanceof AppError
            ? error.message
            : status === 413
              ? "上传大小超出限制"
              : status < 500
                ? "请求格式错误"
                : "服务暂时不可用，请稍后重试",
      },
    });
  });
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff");
    if (
      Number(req.headers["content-length"]) >
      (req.routeOptions.bodyLimit || 16 * 1024)
    )
      fail("PAYLOAD_TOO_LARGE", "上传大小超出限制", 413);
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
      req.headers.origin !== config.origin
    )
      fail("ORIGIN_REJECTED", "请求来源不被允许", 403);
  });
  app.addHook("preParsing", async (req, reply, payload) => {
    const limit = req.routeOptions.bodyLimit || 16 * 1024;
    let size = 0;
    const bounded = new Transform({
      transform(chunk, enc, cb) {
        size += chunk.length;
        this.receivedEncodedLength = size;
        if (size > limit) {
          if (!reply.sent)
            reply
              .code(413)
              .header("Connection", "close")
              .send({
                error: {
                  code: "PAYLOAD_TOO_LARGE",
                  message: "上传大小超出限制",
                },
              });
          cb();
        } else cb(null, chunk);
      },
    });
    bounded.receivedEncodedLength = 0;
    payload.on("error", (error) => bounded.destroy(error));
    return payload.pipe(bounded);
  });
  function session(req, role = null, mutation = false, fresh = false) {
    const cookieToken = req.cookies.course_keys_session;
    if (!cookieToken) fail("UNAUTHENTICATED", "请先使用邮箱验证码登录", 401);
    const s = db
      .prepare("SELECT * FROM sessions WHERE token_hash=? AND expires_at>?")
      .get(digest(config.secret, cookieToken), Date.now());
    if (!s || (s.role === "admin" && !config.adminEmails.includes(s.email)))
      fail("UNAUTHENTICATED", "登录已失效，请重新登录", 401);
    if (role && s.role !== role) fail("FORBIDDEN", "无权执行此操作", 403);
    if (
      s.role === "student" &&
      !db
        .prepare(
          "SELECT 1 FROM students WHERE student_id=? AND email=? AND removed_at IS NULL",
        )
        .get(s.student_id, s.email)
    )
      fail("UNAUTHENTICATED", "登录已失效，请重新登录", 401);
    if (s.role === "student" && !canStudentEnroll(config, s.student_id))
      fail("ENROLLMENT_CLOSED", "公钥登记暂未开放", 403);
    if (mutation && !safeEqual(req.headers["x-csrf-token"], s.csrf))
      fail("CSRF_REJECTED", "请刷新页面后重试", 403);
    if (fresh && Date.now() - s.verified_at > config.freshAuthMs)
      fail("REAUTH_REQUIRED", "导入或撤销前请重新通过邮箱验证码验证", 403);
    return s;
  }
  function keyView(row) {
    return row
      ? {
          id: row.id,
          version: row.version,
          publicKey: row.public_key,
          fingerprint: row.fingerprint,
          algorithm: row.algorithm,
          bits: row.bits,
          createdAt: row.created_at,
        }
      : null;
  }
  function getStudent(sid) {
    const s = db.prepare("SELECT * FROM students WHERE student_id=?").get(sid);
    if (!s) fail("STUDENT_NOT_FOUND", "名单中没有该学生", 404);
    return {
      studentId: s.student_id,
      name: s.name,
      email: s.email,
      username: s.username,
      serverId: s.server_id,
      submitted: Boolean(s.latest_key_id),
      submittedAt: s.submitted_at,
      accountStatus: s.account_status,
      accountMessage: s.account_message,
      latestKey: keyView(
        db.prepare("SELECT * FROM keys WHERE id=?").get(s.latest_key_id),
      ),
      installedKey: keyView(
        db.prepare("SELECT * FROM keys WHERE id=?").get(s.installed_key_id),
      ),
      importStatus: s.import_status,
      lastError: s.last_error,
      revision: s.revision,
      removedAt: s.removed_at,
      removedBy: s.removed_by,
      autoImport: autoImportView(db, s),
      autoImportBlocked: Boolean(s.auto_import_blocked),
    };
  }
  const allStudents = (includeRemoved = false) =>
    db
      .prepare(
        includeRemoved
          ? "SELECT student_id FROM students ORDER BY student_id"
          : "SELECT student_id FROM students WHERE removed_at IS NULL ORDER BY student_id",
      )
      .all()
      .map((s) => getStudent(s.student_id));
  const targetOf = (student) => ({
    studentId: student.studentId,
    serverId: student.serverId,
    username: student.username,
  });
  const targetMatches = (a, b) =>
    a.studentId === b.studentId &&
    a.serverId === b.serverId &&
    a.username === b.username;
  function requireEnrolled(student) {
    if (student.removedAt)
      fail("STUDENT_REMOVED", "该学生已移除，请先明确恢复名单", 409);
  }
  function accessBlock(student) {
    if (student.installedKey) return "请先手动撤销已安装公钥并确认完成";
    if (active(student.studentId))
      return "该学生仍有未完成任务，请等待核验完成";
    if (hasUncertainDeployment(db, student.studentId))
      return "仍有未核对的导入结果，请先确认服务器密钥状态";
    return null;
  }
  const active = (sid) =>
    Boolean(
      db
        .prepare(
          "SELECT 1 FROM batch_items WHERE student_id=? AND status IN ('queued','running') LIMIT 1",
        )
        .get(sid),
    );
  const requireRate = (bucket, limit, period = 600_000) => {
    if (!rate(db, bucket, limit, period))
      fail("RATE_LIMITED", "操作过于频繁，请稍后重试", 429);
  };
  const savePreview = (kind, who, payload) => {
    const previewId = id(),
      expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    db.prepare(
      "INSERT INTO previews(id,kind,admin_email,payload,expires_at) VALUES(?,?,?,?,?)",
    ).run(
      previewId,
      kind,
      who.email,
      JSON.stringify(payload),
      Date.parse(expiresAt),
    );
    return { previewId, expiresAt };
  };
  function takePreview(previewId, kind, who) {
    if (typeof previewId !== "string") fail("INVALID_PREVIEW", "预览标识无效");
    const p = db.prepare("SELECT * FROM previews WHERE id=?").get(previewId);
    if (
      !p ||
      p.kind !== kind ||
      p.admin_email !== who.email ||
      p.expires_at < Date.now() ||
      p.consumed
    )
      fail("PREVIEW_EXPIRED", "预览已过期或已使用，请重新预览", 409);
    return JSON.parse(p.payload);
  }
  async function uploaded(req, max, roster = false) {
    let bytes = null,
      filename = "",
      claimed = null,
      files = 0;
    for await (const part of req.parts({
      limits: {
        fileSize: max,
        files: 1,
        fields: roster ? 0 : 1,
        parts: roster ? 1 : 2,
        fieldSize: 64,
        fieldNameSize: 64,
        headerPairs: 30,
      },
    })) {
      if (part.type === "file") {
        if (part.fieldname !== "file")
          fail("INVALID_UPLOAD", "文件字段必须为 file");
        files++;
        filename = part.filename || "";
        bytes = await part.toBuffer();
        if (part.file.truncated)
          fail("PAYLOAD_TOO_LARGE", "文件大小超出限制", 413);
      } else {
        if (
          roster ||
          part.fieldname !== "studentId" ||
          claimed !== null ||
          part.valueTruncated
        )
          fail("INVALID_REQUEST", "上传请求包含不允许的字段");
        claimed = part.value;
      }
    }
    if (files !== 1 || !bytes) fail("MISSING_FILE", "请选择一个文件");
    return { bytes, filename, claimed };
  }
  app.get(PREFIX + "/health", async () => ({
    ok: true,
    enrollmentOpen: enrollmentMode(config) !== "closed",
    enrollmentMode: enrollmentMode(config),
    mailConfigured: mailer.configured !== false,
    servers: config.servers,
  }));
  app.post(PREFIX + "/auth/request-code", async (req) => {
    forbidExtra(req.body, ["role", "studentId", "email"]);
    const body = req.body;
    if (!["admin", "student"].includes(body.role))
      fail("INVALID_ROLE", "登录角色无效");
    requireRate("otp-ip:" + digest(config.secret, req.ip), 300);
    let email = null,
      sid = null,
      identity = null;
    if (body.role === "student") {
      sid = studentId(body.studentId);
      identity = sid;
      if (body.email !== undefined)
        fail("INVALID_REQUEST", "学生邮箱由名单确定");
      const s = db
        .prepare("SELECT * FROM students WHERE student_id=?")
        .get(sid);
      if (s && !s.removed_at && canStudentEnroll(config, sid)) email = s.email;
    } else {
      if (
        body.studentId !== undefined ||
        typeof body.email !== "string" ||
        body.email.length > 254
      )
        fail("INVALID_EMAIL", "请输入管理员邮箱");
      const candidate = body.email.trim().toLowerCase();
      identity = candidate;
      if (config.adminEmails.includes(candidate)) email = candidate;
    }
    requireRate(
      "otp-cooldown:" + digest(config.secret, body.role + ":" + identity),
      1,
      config.otpResendMs || 60_000,
    );
    requireRate(
      "otp-identity:" + digest(config.secret, body.role + ":" + identity),
      3,
    );
    const challengeId = id(),
      code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    db.prepare(
      "INSERT INTO challenges(id,role,student_id,email,code_hash,expires_at) VALUES(?,?,?,?,?,?)",
    ).run(
      challengeId,
      body.role,
      sid,
      email,
      digest(config.secret, challengeId + ":" + code),
      Date.now() + config.otpTtlMs,
    );
    if (email) {
      try {
        if (mailer.sendCode)
          await mailer.sendCode({ to: email, code, role: body.role });
        else await mailer.send({ email, code, role: body.role });
      } catch {
        db.prepare("UPDATE challenges SET consumed=1 WHERE id=?").run(
          challengeId,
        );
        audit(db, "system", "mail_delivery_failed", null, challengeId);
      }
    }
    return {
      challengeId,
      message: "若身份在课程名单或管理员列表中，验证码将发送到绑定邮箱。",
    };
  });
  app.post(PREFIX + "/auth/verify", async (req, reply) => {
    forbidExtra(req.body, ["challengeId", "code"]);
    requireRate("verify-ip:" + digest(config.secret, req.ip), 600);
    const { challengeId, code } = req.body;
    if (
      typeof challengeId !== "string" ||
      typeof code !== "string" ||
      !/^\d{6}$/.test(code)
    )
      fail("INVALID_CODE", "验证码无效或已过期", 401);
    const value = token(),
      csrf = token(),
      verified = Date.now();
    const challenge = db
      .transaction(() => {
        const c = db
          .prepare("SELECT * FROM challenges WHERE id=?")
          .get(challengeId);
        if (!c || c.consumed || c.expires_at < Date.now() || c.attempts >= 5)
          return null;
        db.prepare("UPDATE challenges SET attempts=attempts+1 WHERE id=?").run(
          challengeId,
        );
        if (
          !c.email ||
          !safeEqual(
            c.code_hash,
            digest(config.secret, challengeId + ":" + code),
          ) ||
          (c.role === "student" &&
            (!canStudentEnroll(config, c.student_id) ||
              !db
                .prepare(
                  "SELECT 1 FROM students WHERE student_id=? AND email=? AND removed_at IS NULL",
                )
                .get(c.student_id, c.email))) ||
          (c.role === "admin" && !config.adminEmails.includes(c.email))
        )
          return null;
        db.prepare("UPDATE challenges SET consumed=1 WHERE id=?").run(
          challengeId,
        );
        db.prepare(
          "INSERT INTO sessions(token_hash,role,student_id,email,csrf,verified_at,expires_at) VALUES(?,?,?,?,?,?,?)",
        ).run(
          digest(config.secret, value),
          c.role,
          c.student_id,
          c.email,
          csrf,
          verified,
          verified + config.sessionTtlMs,
        );
        return c;
      })
      .immediate();
    if (!challenge) fail("INVALID_CODE", "验证码无效或已过期", 401);
    reply.setCookie("course_keys_session", value, {
      path: PREFIX,
      httpOnly: true,
      secure: config.production,
      sameSite: "strict",
      maxAge: Math.floor(config.sessionTtlMs / 1000),
    });
    return {
      user: {
        role: challenge.role,
        ...(challenge.student_id ? { studentId: challenge.student_id } : {}),
        email: challenge.email,
      },
      csrfToken: csrf,
      verifiedAt: new Date(verified).toISOString(),
    };
  });
  app.get(PREFIX + "/auth/session", async (req) => {
    try {
      const s = session(req);
      return {
        user: {
          role: s.role,
          ...(s.student_id ? { studentId: s.student_id } : {}),
          email: s.email,
        },
        csrfToken: s.csrf,
        verifiedAt: new Date(s.verified_at).toISOString(),
      };
    } catch (e) {
      if (e instanceof AppError)
        return { user: null, csrfToken: null, verifiedAt: null };
      throw e;
    }
  });
  app.post(PREFIX + "/auth/logout", async (req, reply) => {
    const s = session(req, null, true);
    db.prepare("DELETE FROM sessions WHERE token_hash=?").run(s.token_hash);
    reply.clearCookie("course_keys_session", {
      path: PREFIX,
      httpOnly: true,
      secure: config.production,
      sameSite: "strict",
    });
    return { ok: true };
  });
  app.get(PREFIX + "/me", async (req) => ({
    student: getStudent(session(req, "student").student_id),
  }));
  app.post(PREFIX + "/me/key", { bodyLimit: 16 * 1024 }, async (req) => {
    const s = session(req, "student", true);
    requireRate("upload:" + s.student_id, 20, 3600_000);
    const file = await uploaded(req, 4096);
    if (file.claimed !== null && file.claimed !== s.student_id)
      fail("IDENTITY_MISMATCH", "提交的学号与登录身份不一致", 403);
    let parsed;
    try {
      parsed = publicKey(file.bytes);
    } catch (e) {
      audit(db, s.email, "key_rejected", s.student_id, e.code || "INVALID_KEY");
      throw e;
    }
    if (!/\.pub$/i.test(file.filename))
      fail("INVALID_EXTENSION", "请选择 .pub 公钥文件");
    const duplicate = db
      .transaction(() => {
        // Upload streaming yields control; removal or logout may revoke this session.
        session(req, "student", true);
        const current = getStudent(s.student_id);
        requireEnrolled(current);
        if (current.latestKey?.fingerprint === parsed.fingerprint) return true;
        const reused = db
          .prepare(
            "SELECT student_id FROM keys WHERE fingerprint=? AND student_id<>? LIMIT 1",
          )
          .get(parsed.fingerprint, s.student_id);
        if (reused)
          fail(
            "KEY_ALREADY_ASSIGNED",
            "该公钥已绑定其他学生，请自行生成独立密钥",
            409,
          );
        const version = db
            .prepare(
              "SELECT COALESCE(MAX(version),0)+1 AS v FROM keys WHERE student_id=?",
            )
            .get(s.student_id).v,
          keyId = id(),
          at = nowIso();
        db.prepare(
          "INSERT INTO keys(id,student_id,version,public_key,fingerprint,algorithm,bits,created_at) VALUES(?,?,?,?,?,?,?,?)",
        ).run(
          keyId,
          s.student_id,
          version,
          parsed.publicKey,
          parsed.fingerprint,
          parsed.algorithm,
          parsed.bits,
          at,
        );
        db.prepare(
          "UPDATE students SET latest_key_id=?,submitted_at=?,revision=revision+1,import_status='pending_review',last_error=NULL WHERE student_id=?",
        ).run(keyId, at, s.student_id);
        recordAutoImport(db, getStudent(s.student_id));
        audit(db, s.email, "key_submitted", s.student_id, parsed.fingerprint);
        return false;
      })
      .immediate();
    if (!duplicate) queueMicrotask(() => void processAutoImports().catch(() => {}));
    return { student: getStudent(s.student_id), duplicate };
  });
  app.get(PREFIX + "/admin/auto-import", async (req) => {
    session(req, "admin");
    return autoImportSettings(db);
  });
  app.put(PREFIX + "/admin/auto-import", async (req) => {
    const who = session(req, "admin", true, true);
    forbidExtra(req.body, ["enabled", "revision"]);
    return changeAutoImportSettings(db, req.body.enabled, req.body.revision, who.email);
  });
  app.get(PREFIX + "/admin/students", async (req) => {
    session(req, "admin");
    if (
      req.query.includeRemoved !== undefined &&
      req.query.includeRemoved !== "true"
    )
      fail("INVALID_QUERY", "includeRemoved 只能为 true");
    const students = allStudents(req.query.includeRemoved === "true"),
      activeStudents = students.filter((student) => !student.removedAt);
    return {
      students,
      stats: {
        total: activeStudents.length,
        submitted: activeStudents.filter((x) => x.submitted).length,
        pending: activeStudents.filter((x) =>
          ["pending_review", "queued", "running"].includes(x.importStatus),
        ).length,
        installed: activeStudents.filter((x) => Boolean(x.installedKey)).length,
        failed: activeStudents.filter((x) => x.importStatus === "failed")
          .length,
        removed: db
          .prepare(
            "SELECT count(*) AS n FROM students WHERE removed_at IS NOT NULL",
          )
          .get().n,
      },
    };
  });
  app.get(PREFIX + "/admin/roster/template", async (req, reply) => {
    session(req, "admin");
    if (req.query.format === "csv") {
      reply
        .type("text/csv; charset=utf-8")
        .header(
          "Content-Disposition",
          'attachment; filename="course-roster-template.csv"',
        );
      return "\uFEFF" + HEADERS.join(",") + "\r\n";
    }
    reply
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header(
        "Content-Disposition",
        'attachment; filename="course-roster-template.xlsx"',
      );
    return workbookBuffer(HEADERS, []);
  });
  app.post(
    PREFIX + "/admin/roster/preview",
    { bodyLimit: 2 * 1024 * 1024 + 16 * 1024 },
    async (req) => {
      const s = session(req, "admin", true);
      const file = await uploaded(req, 2 * 1024 * 1024, true);
      const result = await parseRoster(file.bytes, file.filename, config, db);
      const preview = result.errors.length
        ? { previewId: null }
        : savePreview("roster", s, result.rows);
      return { ...result, ...preview };
    },
  );
  app.post(PREFIX + "/admin/roster/commit", async (req) => {
    const s = session(req, "admin", true);
    forbidExtra(req.body, ["previewId"]);
    return db
      .transaction(() => {
        const rows = takePreview(req.body.previewId, "roster", s);
        for (const r of rows) {
          const current = db
            .prepare("SELECT * FROM students WHERE student_id=?")
            .get(r.studentId);
          if ((current?.revision ?? null) !== r.baseRevision)
            fail("STALE_PREVIEW", "名单已有变动，请重新预览", 409);
          if (current?.removed_at)
            fail("STUDENT_REMOVED", "已移除的学号必须先明确恢复", 409);
          if (
            current &&
            (current.server_id !== r.serverId ||
              current.username !== r.username)
          ) {
            const reason = accessBlock(getStudent(r.studentId));
            if (reason) fail("TARGET_CHANGE_BLOCKED", reason, 409);
          }
          if (r.change !== "unchanged" && active(r.studentId))
            fail("ACCOUNT_BUSY", "该学生正在导入，请完成后再更新名单", 409);
        }
        if (
          db
            .prepare(
              "SELECT count(*) AS n FROM students WHERE removed_at IS NULL",
            )
            .get().n +
            rows.filter((r) => r.change === "add").length >
          2000
        )
          fail("ROSTER_FULL", "在册学生人数不能超过 2000", 409);
        for (const r of rows) {
          if (r.change === "add")
            db.prepare(
              "INSERT INTO students(student_id,name,email,username,server_id) VALUES(?,?,?,?,?)",
            ).run(r.studentId, r.name, r.email, r.username, r.serverId);
          else if (r.change === "update") {
            const old = getStudent(r.studentId),
              changed =
                old.serverId !== r.serverId || old.username !== r.username;
            if (changed) cancelAutoImport(db, r.studentId, "服务器分配已变更，原自动导入已取消");
            db.prepare(
              "UPDATE students SET name=?,username=?,server_id=?,revision=revision+1,account_status=?,account_message=?,import_status=?,last_error=? WHERE student_id=?",
            ).run(
              r.name,
              r.username,
              r.serverId,
              changed ? "unchecked" : old.accountStatus,
              changed ? null : old.accountMessage,
              changed
                ? old.latestKey
                  ? "pending_review"
                  : "not_submitted"
                : old.importStatus,
              changed ? null : old.lastError,
              r.studentId,
            );
          }
        }
        db.prepare("UPDATE previews SET consumed=1 WHERE id=?").run(
          req.body.previewId,
        );
        audit(db, s.email, "roster_committed", null, String(rows.length));
        return { count: rows.length };
      })
      .immediate();
  });
  app.get(PREFIX + "/admin/students/export", async (req, reply) => {
    session(req, "admin");
    const students = allStudents();
    reply
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", 'attachment; filename="course-keys.xlsx"');
    return workbookBuffer(
      [
        "学号",
        "姓名",
        "邮箱",
        "服务器账号",
        "服务器号",
        "已提交有效公钥",
        "提交时间",
        "账号检查",
        "导入状态",
        "公钥指纹",
        "已安装指纹",
        "完整公钥",
      ],
      students.map((s) => [
        s.studentId,
        s.name,
        s.email,
        s.username,
        s.serverId,
        s.submitted ? "✓" : "",
        s.submittedAt,
        s.accountStatus,
        s.importStatus,
        s.latestKey?.fingerprint,
        s.installedKey?.fingerprint,
        s.latestKey?.publicKey,
      ]),
    );
  });
  async function checkAccounts(ids) {
    const revisions = new Map();
    const targets = ids.map((sid) => {
      const student = getStudent(sid);
      requireEnrolled(student);
      revisions.set(sid, student.revision);
      return targetOf(student);
    });
    let accounts;
    try {
      accounts = await importer.check(targets);
    } catch {
      fail("IMPORTER_UNAVAILABLE", "账号检查服务暂时不可用", 503);
    }
    if (!Array.isArray(accounts)) accounts = accounts?.accounts;
    if (!Array.isArray(accounts))
      fail("IMPORTER_UNAVAILABLE", "账号检查服务返回无效数据", 503);
    const matches = targets.map((target) => {
      const account = accounts.find((item) => targetMatches(item, target));
      if (
        !account ||
        !["ready", "missing", "unauthorized", "error"].includes(account.status)
      )
        fail("IMPORTER_RESULT_MISMATCH", "账号检查结果与目标服务器不一致", 503);
      return { target, account };
    });
    db.transaction(() => {
      for (const { target, account } of matches) {
        const current = getStudent(target.studentId);
        requireEnrolled(current);
        if (
          !targetMatches(current, target) ||
          current.revision !== revisions.get(target.studentId)
        )
          fail("STALE_TARGET", "学生名单或公钥状态已有变更，请重新检查", 409);
        db.prepare(
          "UPDATE students SET account_status=?,account_message=? WHERE student_id=?",
        ).run(
          account.status,
          account.status === "missing"
            ? "账号不存在，待创建"
            : account.message || null,
          target.studentId,
        );
      }
    }).immediate();
    return ids.map(getStudent);
  }
  app.post(PREFIX + "/admin/students/check", async (req) => {
    session(req, "admin", true);
    forbidExtra(req.body, ["studentIds"]);
    return { students: await checkAccounts(selectedIds(req.body.studentIds)) };
  });
  async function importPreview(
    s,
    ids,
    action = "install",
    restoreKeyId = null,
  ) {
    await checkAccounts(ids);
    const items = ids.map((sid) => {
      const st = getStudent(sid);
      const chosen = restoreKeyId
        ? keyView(
            db
              .prepare("SELECT * FROM keys WHERE id=? AND student_id=?")
              .get(restoreKeyId, sid),
          )
        : action === "revoke"
          ? st.installedKey
          : st.latestKey;
      if (restoreKeyId && !chosen)
        fail("KEY_NOT_FOUND", "公钥历史记录不存在", 404);
      let reason = active(sid)
        ? "该账号已有导入任务，请等待完成"
        : st.accountStatus !== "ready"
          ? st.accountMessage || "服务器账号尚未授权，请联系管理员"
          : !chosen
            ? "没有可导入或撤销的公钥"
            : action === "install" &&
                st.installedKey?.fingerprint === chosen.fingerprint
              ? "该公钥已安装"
              : null;
      return {
        studentId: sid,
        name: st.name,
        username: st.username,
        serverId: st.serverId,
        keyId: chosen?.id || null,
        fingerprint: chosen?.fingerprint || null,
        action,
        eligible: !reason,
        reason,
        revision: st.revision,
        publicKey: action === "revoke" ? null : chosen?.publicKey || null,
      };
    });
    return {
      ...savePreview(
        action === "install" && !restoreKeyId ? "import" : "key-action",
        s,
        items,
      ),
      items: items.map(({ publicKey, revision, ...x }) => x),
    };
  }
  app.post(PREFIX + "/admin/imports/preview", async (req) => {
    const s = session(req, "admin", true);
    forbidExtra(req.body, ["studentIds"]);
    return importPreview(s, selectedIds(req.body.studentIds));
  });
  function lifecyclePreview(who, ids, action) {
    const items = ids.map((sid) => {
      const student = getStudent(sid);
      let reason =
        action === "remove"
          ? student.removedAt
            ? "该学生已移除"
            : null
          : !student.removedAt
            ? "该学生已在册"
            : null;
      reason ||= accessBlock(student);
      return {
        ...targetOf(student),
        name: student.name,
        eligible: !reason,
        reason,
        revision: student.revision,
      };
    });
    return {
      ...savePreview("roster-" + action, who, items),
      items: items.map(({ revision, ...item }) => item),
    };
  }
  function lifecycleConfirm(who, previewId, action) {
    return db
      .transaction(() => {
        if (typeof previewId !== "string")
          fail("INVALID_PREVIEW", "预览标识无效");
        const preview = db
          .prepare("SELECT * FROM previews WHERE id=?")
          .get(previewId);
        if (
          !preview ||
          preview.kind !== "roster-" + action ||
          preview.admin_email !== who.email
        )
          fail("PREVIEW_EXPIRED", "预览已过期或已使用，请重新预览", 409);
        const selected = JSON.parse(preview.payload).filter(
          (item) => item.eligible,
        );
        if (preview.consumed) return { count: selected.length };
        if (preview.expires_at < Date.now())
          fail("PREVIEW_EXPIRED", "预览已过期，请重新预览", 409);
        if (!selected.length)
          fail("NO_ELIGIBLE_STUDENTS", "没有符合操作条件的学生", 409);
        if (
          action === "restore" &&
          db
            .prepare(
              "SELECT count(*) AS n FROM students WHERE removed_at IS NULL",
            )
            .get().n +
            selected.length >
            2000
        )
          fail("ROSTER_FULL", "在册学生人数不能超过 2000", 409);
        for (const item of selected) {
          const student = getStudent(item.studentId);
          if (
            student.revision !== item.revision ||
            !targetMatches(student, item) ||
            (action === "remove"
              ? Boolean(student.removedAt)
              : !student.removedAt)
          )
            fail(
              "STALE_PREVIEW",
              "学生名单或公钥状态已有变动，请重新预览",
              409,
            );
          const blocked = accessBlock(student);
          if (blocked) fail("REMOVAL_BLOCKED", blocked, 409);
        }
        const at = nowIso();
        for (const item of selected) {
          cancelAutoImport(db, item.studentId, action === "remove" ? "学生已移除，自动导入已取消" : "学生名单已恢复，旧公钥请由管理员手动导入");
          if (action === "remove")
            db.prepare(
              "UPDATE students SET removed_at=?,removed_by=?,revision=revision+1 WHERE student_id=?",
            ).run(at, who.email, item.studentId);
          else
            db.prepare(
              "UPDATE students SET removed_at=NULL,removed_by=NULL,revision=revision+1,account_status='unchecked',account_message=NULL,last_error=NULL,import_status=CASE WHEN latest_key_id IS NULL THEN 'not_submitted' ELSE 'pending_review' END WHERE student_id=?",
            ).run(item.studentId);
          db.prepare(
            "DELETE FROM sessions WHERE role='student' AND student_id=?",
          ).run(item.studentId);
          db.prepare(
            "UPDATE challenges SET consumed=1 WHERE role='student' AND student_id=?",
          ).run(item.studentId);
          audit(
            db,
            who.email,
            action === "remove" ? "student_removed" : "student_restored",
            item.studentId,
            JSON.stringify({
              serverId: item.serverId,
              username: item.username,
            }),
          );
        }
        db.prepare("UPDATE previews SET consumed=1 WHERE id=?").run(previewId);
        return { count: selected.length };
      })
      .immediate();
  }
  for (const action of ["remove", "restore"]) {
    app.post(PREFIX + "/admin/students/" + action + "-preview", async (req) => {
      const who = session(req, "admin", true);
      forbidExtra(req.body, ["studentIds"]);
      return lifecyclePreview(who, selectedIds(req.body.studentIds), action);
    });
    app.post(PREFIX + "/admin/students/" + action + "-confirm", async (req) => {
      const who = session(req, "admin", true, true);
      forbidExtra(req.body, ["previewId"]);
      return lifecycleConfirm(who, req.body.previewId, action);
    });
  }
  app.get(PREFIX + "/admin/students/:studentId/keys", async (req) => {
    session(req, "admin");
    const sid = studentId(req.params.studentId);
    getStudent(sid);
    return {
      keys: db
        .prepare("SELECT * FROM keys WHERE student_id=? ORDER BY version DESC")
        .all(sid)
        .map(keyView),
    };
  });
  app.post(PREFIX + "/admin/key-actions/preview", async (req) => {
    const s = session(req, "admin", true);
    forbidExtra(req.body, ["studentId", "action", "keyId"]);
    const sid = studentId(req.body.studentId);
    if (!["revoke", "restore"].includes(req.body.action))
      fail("INVALID_ACTION", "操作必须是撤销或恢复");
    if (req.body.action === "restore" && typeof req.body.keyId !== "string")
      fail("KEY_REQUIRED", "请选择要恢复的历史公钥");
    return importPreview(
      s,
      [sid],
      req.body.action === "revoke" ? "revoke" : "install",
      req.body.action === "restore" ? req.body.keyId : null,
    );
  });
  function batchView(batchId) {
    const b = db.prepare("SELECT * FROM batches WHERE id=?").get(batchId);
    if (!b) fail("BATCH_NOT_FOUND", "导入批次不存在", 404);
    const rows = db
      .prepare("SELECT * FROM batch_items WHERE batch_id=? ORDER BY id")
      .all(batchId);
    const statuses = rows.map((r) => r.status);
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
      id: b.id,
      source: b.source,
      status,
      createdAt: b.created_at,
      items: rows.map((r) => ({
        studentId: r.student_id,
        serverId: r.server_id,
        username: r.username,
        action: r.action,
        status: r.status,
        fingerprint: r.fingerprint,
        error: r.error,
      })),
    };
  }
  // The caller owns an immediate transaction: policy checks and approval commit together.
  function approveBatch({ source, actor, requestId: rid, previewId, items }) {
    requestId(rid);
    for (const item of items) {
      const current = getStudent(item.studentId);
      requireEnrolled(current);
      if (current.revision !== item.revision || !targetMatches(current, item))
        fail("STALE_PREVIEW", "公钥或名单已有变动，请重新预览", 409);
      if (active(item.studentId))
        fail("ACCOUNT_BUSY", "学生账号已有正在运行的导入任务", 409);
    }
    const batchId = id();
    db.prepare(
      "INSERT INTO batches(id,request_id,preview_id,admin_email,created_at,source) VALUES(?,?,?,?,?,?)",
    ).run(batchId, rid, previewId, actor, nowIso(), source);
    for (const item of items) {
      if (source === "manual") {
        cancelAutoImport(db, item.studentId, "管理员已安排手动操作，原自动导入已取消");
        if (item.action === "revoke")
          db.prepare("UPDATE students SET auto_import_blocked=1 WHERE student_id=?").run(item.studentId);
      }
      db.prepare(
        "INSERT INTO batch_items(batch_id,student_id,server_id,username,key_id,action,revision,fingerprint,public_key) VALUES(?,?,?,?,?,?,?,?,?)",
      ).run(
        batchId, item.studentId, item.serverId, item.username, item.keyId, item.action,
        item.revision + 1, item.fingerprint, item.publicKey,
      );
      db.prepare(
        "UPDATE students SET import_status='queued',last_error=NULL,revision=revision+1 WHERE student_id=?",
      ).run(item.studentId);
    }
    audit(db, actor, "batch_approved", null, batchId);
    return batchId;
  }
  function commitBatch(s, previewId, rid, kind) {
    return db.transaction(() => {
      requestId(rid);
      const prior = db.prepare("SELECT * FROM batches WHERE request_id=?").get(rid);
      if (prior) {
        if (prior.preview_id !== previewId || prior.admin_email !== s.email || prior.source !== "manual")
          fail("IDEMPOTENCY_CONFLICT", "请求标识已用于不同操作", 409);
        return batchView(prior.id);
      }
      const selected = takePreview(previewId, kind, s).filter((item) => item.eligible);
      if (!selected.length)
        fail("NO_ELIGIBLE_STUDENTS", "没有符合导入条件的学生", 409);
      const batchId = approveBatch({
        source: "manual", actor: s.email, requestId: rid, previewId, items: selected,
      });
      db.prepare("UPDATE previews SET consumed=1 WHERE id=?").run(previewId);
      return batchView(batchId);
    }).immediate();
  }
  app.post(PREFIX + "/admin/imports", async (req) => {
    const s = session(req, "admin", true, true);
    forbidExtra(req.body, ["previewId", "requestId"]);
    const b = commitBatch(s, req.body.previewId, req.body.requestId, "import");
    queueMicrotask(() => void synchronize());
    return b;
  });
  app.post(PREFIX + "/admin/key-actions", async (req) => {
    const s = session(req, "admin", true, true);
    forbidExtra(req.body, ["previewId", "requestId"]);
    const b = commitBatch(
      s,
      req.body.previewId,
      req.body.requestId,
      "key-action",
    );
    queueMicrotask(() => void synchronize());
    return b;
  });
  app.get(PREFIX + "/admin/imports", async (req) => {
    session(req, "admin");
    return {
      batches: db
        .prepare("SELECT id FROM batches ORDER BY created_at DESC LIMIT 100")
        .all()
        .map((b) => batchView(b.id)),
    };
  });
  app.get(PREFIX + "/admin/imports/:id", async (req) => {
    session(req, "admin");
    return batchView(req.params.id);
  });
  app.post(PREFIX + "/admin/imports/:id/retry", async (req) => {
    const s = session(req, "admin", true, true);
    forbidExtra(req.body, ["requestId"]);
    const rid = requestId(req.body.requestId);
    const exists = db
      .prepare("SELECT * FROM batches WHERE request_id=?")
      .get(rid);
    if (exists) {
      if (
        exists.preview_id !== `retry:${req.params.id}:${rid}` ||
        exists.admin_email !== s.email
      )
        fail("IDEMPOTENCY_CONFLICT", "请求标识已用于不同操作", 409);
      return batchView(exists.id);
    }
    batchView(req.params.id);
    const failed = db
      .prepare("SELECT * FROM batch_items WHERE batch_id=? AND status='failed'")
      .all(req.params.id);
    if (!failed.length)
      fail("NO_FAILED_ITEMS", "该批次没有可重试的失败项", 409);
    const items = failed.map((i) => {
      const st = getStudent(i.student_id);
      if (
        st.removedAt ||
        st.revision !== i.revision ||
        st.serverId !== i.server_id ||
        st.username !== i.username ||
        active(i.student_id)
      )
        fail("SUPERSEDED", "学生公钥或状态已有变更，请重新预览", 409);
      return {
        studentId: i.student_id,
        serverId: i.server_id,
        username: i.username,
        keyId: i.key_id,
        action: i.action,
        revision: i.revision,
        fingerprint: i.fingerprint,
        publicKey: i.public_key,
        eligible: true,
      };
    });
    const previewId = `retry:${req.params.id}:${rid}`;
    db.prepare(
      "INSERT INTO previews(id,kind,admin_email,payload,expires_at) VALUES(?,?,?,?,?)",
    ).run(
      previewId,
      "import",
      s.email,
      JSON.stringify(items),
      Date.now() + 60_000,
    );
    const batch = commitBatch(s, previewId, rid, "import");
    queueMicrotask(() => void synchronize());
    return batch;
  });
  let syncing = null,
    closed = false;
  async function synchronize() {
    if (closed) return;
    if (syncing) return syncing;
    syncing = (async () => {
      const batches = db
        .prepare(
          "SELECT DISTINCT b.* FROM batches b JOIN batch_items i ON i.batch_id=b.id WHERE i.status IN ('queued','running') ORDER BY b.created_at",
        )
        .all();
      for (const b of batches) {
        if (closed) break;
        const local = db
          .prepare("SELECT * FROM batch_items WHERE batch_id=? ORDER BY id")
          .all(b.id);
        try {
          const remote = b.remote_id
            ? await importer.get(b.remote_id)
            : await importer.submit({
                requestId: b.request_id,
                items: local.map((i) => ({
                  studentId: i.student_id,
                  serverId: i.server_id,
                  username: i.username,
                  action: i.action,
                  publicKey: i.public_key,
                  fingerprint: i.fingerprint,
                })),
              });
          if (
            !remote ||
            typeof remote.id !== "string" ||
            !Array.isArray(remote.items)
          )
            throw new Error("Invalid importer response");
          db.transaction(() => {
            db.prepare(
              "UPDATE batches SET remote_id=?,dispatched=1,dispatch_error=NULL WHERE id=?",
            ).run(remote.id, b.id);
            for (const item of local) {
              // Another poll may already have finished this item while this request awaited I/O.
              // Never project a terminal old item over a newer batch for the same student.
              const currentItem = db.prepare("SELECT status FROM batch_items WHERE id=?").get(item.id);
              if (!["queued", "running"].includes(currentItem?.status)) continue;
              const r = remote.items.find(
                (x) =>
                  x.studentId === item.student_id &&
                  x.serverId === item.server_id &&
                  x.username === item.username &&
                  x.action === item.action,
              );
              if (
                !r ||
                ![
                  "queued",
                  "running",
                  "success",
                  "failed",
                  "superseded",
                ].includes(r.status) ||
                r.fingerprint !== item.fingerprint
              )
                throw new Error("Importer result mismatch");
              db.prepare(
                "UPDATE batch_items SET status=?,error=?,generation=? WHERE id=?",
              ).run(r.status, r.error || null, r.generation ?? null, item.id);
              const st = getStudent(item.student_id);
              if (
                st.removedAt ||
                st.serverId !== item.server_id ||
                st.username !== item.username
              )
                throw new Error(
                  "Stored target changed while a deployment was active",
                );
              if (r.status === "success") {
                const installed = item.action === "revoke" ? null : item.key_id;
                let state = item.action === "revoke" ? "revoked" : "installed";
                if (st.latestKey?.id !== item.key_id) state = "pending_review";
                db.prepare(
                  "UPDATE students SET installed_key_id=?,import_status=?,last_error=NULL WHERE student_id=?",
                ).run(installed, state, item.student_id);
                if (b.source === "automatic")
                  db.prepare("DELETE FROM auto_import_candidates WHERE batch_id=? AND student_id=? AND status='queued'")
                    .run(b.id, item.student_id);
                else if (item.action === "install") {
                  db.prepare("UPDATE students SET auto_import_blocked=0 WHERE student_id=?").run(item.student_id);
                  db.prepare("DELETE FROM auto_import_candidates WHERE student_id=? AND status IN ('blocked','cancelled')")
                    .run(item.student_id);
                }
              } else if (["failed", "superseded"].includes(r.status)) {
                if (b.source === "automatic")
                  db.prepare("UPDATE auto_import_candidates SET status='blocked',message=? WHERE batch_id=? AND student_id=? AND status='queued'")
                    .run(r.error || "自动导入失败，请由管理员检查后手动处理", b.id, item.student_id);
                const state =
                  st.revision === item.revision ? "failed" : "pending_review";
                db.prepare(
                  "UPDATE students SET import_status=?,last_error=? WHERE student_id=?",
                ).run(
                  state,
                  r.error || "导入失败，请重新检查",
                  item.student_id,
                );
              } else if (st.revision === item.revision)
                db.prepare(
                  "UPDATE students SET import_status=? WHERE student_id=?",
                ).run(r.status, item.student_id);
            }
          }).immediate();
        } catch (e) {
          const permanent =
            e instanceof AppError && e.statusCode >= 400 && e.statusCode < 500;
          db.prepare("UPDATE batches SET dispatch_error=? WHERE id=?").run(
            permanent ? e.message : "导入服务暂时不可达，系统会自动重试",
            b.id,
          );
          if (permanent) {
            db.transaction(() => {
              for (const item of local) {
                const currentItem = db.prepare("SELECT status FROM batch_items WHERE id=?").get(item.id);
                if (!["queued", "running"].includes(currentItem?.status)) continue;
                db.prepare("UPDATE batch_items SET status='failed',error=? WHERE id=?")
                  .run(e.message, item.id);
                if (b.source === "automatic")
                  db.prepare("UPDATE auto_import_candidates SET status='blocked',message=? WHERE batch_id=? AND student_id=? AND status='queued'")
                    .run(e.message, b.id, item.student_id);
                const current = getStudent(item.student_id);
                db.prepare("UPDATE students SET import_status=?,last_error=? WHERE student_id=?")
                  .run(current.revision === item.revision ? "failed" : "pending_review", e.message, item.student_id);
              }
            }).immediate();
          }
        }
      }
    })().finally(() => {
      syncing = null;
    });
    return syncing;
  }
  const autoImporter = createAutoImporter({
    db, config, getStudent, checkAccounts, active, approveBatch,
    wakeSynchronize: () => queueMicrotask(() => void synchronize()),
  });
  const processAutoImports = autoImporter.processAutoImports;
  app.decorate("synchronize", synchronize);
  app.decorate("processAutoImports", processAutoImports);
  const timer = setInterval(() => {
    void processAutoImports().catch(() => {});
    void synchronize();
  }, config.pollMs);
  app.addHook("onReady", async () => {
    queueMicrotask(() => {
      void processAutoImports().catch(() => {});
      void synchronize();
    });
  });
  timer.unref();
  app.addHook("onClose", async () => {
    closed = true;
    clearInterval(timer);
    await autoImporter.close();
    if (syncing) await syncing;
    mailer.close?.();
    if (!options.db) db.close();
  });
  return app;
}
