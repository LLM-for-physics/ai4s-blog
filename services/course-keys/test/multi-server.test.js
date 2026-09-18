import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createWorker } from "../src/worker-app.js";
import { loadConfig } from "../src/config.js";
import { target, helperInvocation, checkedResponse } from "../src/targets.js";
import { publicKey } from "../src/security.js";
import { edKey } from "./helpers.js";

const sid = "2501110104";
const destination = (serverId = "190", studentId = sid) => ({ serverId, studentId, username: "stu" + studentId });
const config = () => ({ ...loadConfig({ NODE_ENV: "test", COURSE_KEYS_IMPORTER_DB: ":memory:", COURSE_KEYS_ORIGIN: "http://localhost" }, "worker"), pollMs: 60000 });
function fakeHelper() {
  const states = new Map(), writes = [], unavailable = new Set();
  return { states, writes, unavailable, async run(request) {
    target(request);
    if (unavailable.has(request.serverId)) throw new Error("Server unavailable");
    const key = request.serverId + ":" + request.username;
    const state = states.get(key) || { generation: 0, action: "none", fingerprint: null, publicKey: null };
    const reply = { ok: true, ...destination(request.serverId, request.studentId), accountStatus: "ready", ...state, error: null };
    if (request.operation === "apply") {
      assert.ok(request.generation > state.generation);
      const next = { generation: request.generation, action: request.action, fingerprint: request.fingerprint, publicKey: request.publicKey };
      states.set(key, next); writes.push({ ...request });
      return { ...reply, ...next };
    }
    return reply;
  }};
}
function item(serverId, studentId = sid) {
  return { ...destination(serverId, studentId), action: "install", ...publicKey(edKey().key) };
}
function installation(serverId, studentId = sid) {
  const { action, publicKey: key, fingerprint, ...unused } = item(serverId, studentId);
  return { ...destination(serverId, studentId), action, publicKey: key, fingerprint };
}
async function complete(worker, items) {
  const body = { requestId: crypto.randomUUID(), items };
  const initial = await worker.submit(body);
  await worker.processJobs();
  return { body, result: (await worker.inject({ url: "/jobs/" + initial.id })).json() };
}

test("server and username validation rejects arbitrary routing and usernames", () => {
  assert.deepEqual(target(destination()), destination());
  for (const value of [{ ...destination(), serverId: "fyl190" }, { ...destination(), serverId: "198" }, { ...destination(), username: sid }, { ...destination(), username: "root" }])
    assert.throws(() => target(value));
  assert.throws(() => checkedResponse(destination("132"), { ok: true, ...destination("190") }), /destination/);
});

test("remote route has fixed SSH argv and missing route never falls back to local sudo", () => {
  const cfg = config();
  assert.equal(helperInvocation(cfg, destination("190")).command, "/usr/bin/sudo");
  assert.throws(() => helperInvocation(cfg, destination("132")), (error) => error.code === "TARGET_NOT_CONFIGURED");
  cfg.helperTargets["132"] = { transport: "ssh", host: "162.105.151.132", port: 2024, user: "course-keys-receiver", identityFile: "/var/lib/course-key-service/importer/ssh/id_ed25519", knownHostsFile: "/etc/course-keys/known_hosts" };
  const invocation = helperInvocation(cfg, destination("132"));
  assert.equal(invocation.command, "/usr/bin/ssh");
  assert.equal(invocation.args.at(-1), "course-keys-receiver@162.105.151.132");
  assert.ok(invocation.args.includes("StrictHostKeyChecking=yes"));
  assert.ok(invocation.args.includes("BatchMode=yes"));
  assert.ok(!invocation.args.some((arg) => arg.includes(sid)));
});

test("three-server mixed batch freezes targets and an unavailable server cannot alter successes", async (t) => {
  const helper = fakeHelper(), worker = await createWorker({ config: config(), helper });
  t.after(() => worker.close());
  helper.unavailable.add("197");
  const inputs = [installation("132", "2501110104"), installation("190", "2501110105"), installation("197", "2501110106")];
  const { body, result } = await complete(worker, inputs);
  assert.equal(result.status, "partial");
  assert.deepEqual(result.items.map((value) => [value.serverId, value.username, value.status]), [["132", "stu2501110104", "success"], ["190", "stu2501110105", "success"], ["197", "stu2501110106", "failed"]]);
  assert.deepEqual(helper.writes.map((value) => value.serverId), ["132", "190"]);
  inputs[0].serverId = "197";
  await assert.rejects(() => worker.submit(body), (error) => error.code === "IDEMPOTENCY_CONFLICT");
  const stored = worker.db.prepare("SELECT server_id,username FROM tasks ORDER BY id").all();
  assert.deepEqual(stored.map((row) => row.server_id), ["132", "190", "197"]);
  assert.equal(helper.writes.length, 2);
});

test("the same student on different servers has independent generation history", async (t) => {
  const helper = fakeHelper(), worker = await createWorker({ config: config(), helper });
  t.after(() => worker.close());
  const a = await complete(worker, [installation("190")]);
  const b = await complete(worker, [installation("132")]);
  const c = await complete(worker, [installation("190")]);
  assert.equal(a.result.items[0].generation, 1);
  assert.equal(b.result.items[0].generation, 1);
  assert.equal(c.result.items[0].generation, 2);
  assert.equal(helper.states.size, 2);
});

test("worker rejects a response from a different server before installation", async (t) => {
  let writes = 0;
  const helper = { async run(request) {
    if (request.operation === "apply") writes++;
    return { ok: true, ...destination("190", request.studentId), accountStatus: "ready", generation: 0, action: "none", fingerprint: null, publicKey: null };
  }};
  const worker = await createWorker({ config: config(), helper });
  t.after(() => worker.close());
  const { result } = await complete(worker, [installation("132")]);
  assert.equal(result.status, "failed");
  assert.equal(writes, 0);
  const checked = (await worker.inject({ method: "POST", url: "/check", payload: { targets: [destination("132")] } })).json();
  assert.equal(checked.accounts[0].status, "error");
});

test("a stalled remote write does not block another server's queue", { timeout: 5000 }, async (t) => {
  const base = fakeHelper();
  let release, notifyHealthy;
  const stalled = new Promise(resolve => { release = resolve; });
  const healthy = new Promise(resolve => { notifyHealthy = resolve; });
  const helper = { async run(request) {
    if (request.operation === "apply" && request.serverId === "132") await stalled;
    const result = await base.run(request);
    if (request.operation === "apply" && request.serverId === "190") notifyHealthy();
    return result;
  }};
  const worker = await createWorker({ config: config(), helper });
  t.after(async () => { release(); await worker.close(); });
  const job = await worker.submit({ requestId: crypto.randomUUID(), items: [installation("132", "2501110104"), installation("190", "2501110105")] });
  await healthy;
  assert.equal(base.writes.length, 1);
  assert.equal(base.writes[0].serverId, "190");
  release();
  await worker.processJobs();
  assert.equal((await worker.inject({url:"/jobs/"+job.id})).json().status, "completed");
});
