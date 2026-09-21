import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWorker } from "../src/worker-app.js";
import { loadConfig } from "../src/config.js";
import { publicKey } from "../src/security.js";
import { openDatabase } from "../src/db.js";
import { edKey, helperMock } from "./helpers.js";
const sid = "0012345678";
function config(filename = ":memory:") {
  return {
    ...loadConfig({
      NODE_ENV: "test",
      COURSE_KEYS_DB: ":memory:",
      COURSE_KEYS_IMPORTER_DB: filename,
      COURSE_KEYS_ORIGIN: "http://localhost",
    }),
    pollMs: 60_000,
  };
}
function install(studentId = sid) {
  const key = publicKey(edKey().key);
  return {
    studentId,
    serverId: "190",
    username: "stu" + studentId,
    action: "install",
    publicKey: key.publicKey,
    fingerprint: key.fingerprint,
  };
}
async function done(worker, body) {
  const job = await worker.submit(body);
  await worker.processJobs();
  const reply = await worker.inject({ url: "/jobs/" + job.id });
  return reply.json();
}
test("worker persists idempotency and reports mixed account results separately", async (t) => {
  const helper = helperMock();
  helper.missing.add("0012345679");
  const worker = await createWorker({ config: config(), helper });
  t.after(() => worker.close());
  const body = {
    requestId: crypto.randomUUID(),
    items: [install(), install("0012345679")],
  };
  const result = await done(worker, body);
  assert.equal(result.status, "partial");
  assert.equal(result.items[0].status, "success");
  assert.equal(result.items[1].status, "failed");
  assert.equal(helper.applies.length, 1);
  const duplicate = await worker.submit(body);
  assert.equal(duplicate.id, result.id);
  assert.equal(helper.applies.length, 1);
  await assert.rejects(
    () => worker.submit({ ...body, items: [install()] }),
    (e) => e.code === "IDEMPOTENCY_CONFLICT",
  );
});
test("install revoke and restore each advance generation; rejected stale state never overwrites", async (t) => {
  const helper = helperMock(),
    worker = await createWorker({ config: config(), helper });
  t.after(() => worker.close());
  const key = install();
  let result = await done(worker, {
    requestId: crypto.randomUUID(),
    items: [key],
  });
  assert.equal(result.items[0].generation, 1);
  result = await done(worker, {
    requestId: crypto.randomUUID(),
    items: [
      {
        studentId: sid,
        serverId: "190",
        username: "stu" + sid,
        action: "revoke",
        publicKey: null,
        fingerprint: key.fingerprint,
      },
    ],
  });
  assert.equal(result.items[0].generation, 2);
  assert.equal(helper.states.get(sid).action, "revoke");
  assert.equal(helper.states.get(sid).fingerprint, null);
  result = await done(worker, { requestId: crypto.randomUUID(), items: [key] });
  assert.equal(result.items[0].generation, 3);
  assert.equal(helper.states.get(sid).fingerprint, key.fingerprint);
});
test("apply response loss reconciles actual persisted state without a second write", async (t) => {
  const helper = helperMock(),
    worker = await createWorker({ config: config(), helper });
  t.after(() => worker.close());
  helper.dropNextResponse = true;
  const result = await done(worker, {
    requestId: crypto.randomUUID(),
    items: [install()],
  });
  assert.equal(result.status, "completed");
  assert.equal(helper.applies.length, 1);
});
test("a restarted worker reconciles an interrupted running task before attempting apply", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "course-keys-worker-"));
  const filename = path.join(tmp, "jobs.sqlite3");
  let second;
  t.after(async () => {
    if (second) await second.close();
    assert.equal(path.dirname(path.resolve(tmp)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(tmp).startsWith("course-keys-worker-"));
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const helper = helperMock(),
    first = await createWorker({ config: config(filename), helper });
  const body = { requestId: crypto.randomUUID(), items: [install()] },
    result = await done(first, body);
  first.db.prepare("UPDATE tasks SET status='running'").run();
  await first.close();
  second = await createWorker({ config: config(filename), helper });
  await second.ready();
  await second.processJobs();
  assert.equal(
    (await second.inject({ url: "/jobs/" + result.id })).json().status,
    "completed",
  );
  assert.equal(helper.applies.length, 1);
  assert.equal((await second.submit(body)).id, result.id);
});
test("worker checks current remote generation before allocating after lost local history", async (t) => {
  const helper = helperMock();
  helper.states.set(sid, {
    generation: 27,
    action: "revoke",
    publicKey: null,
    fingerprint: null,
  });
  const worker = await createWorker({ config: config(), helper });
  t.after(() => worker.close());
  const result = await done(worker, {
    requestId: crypto.randomUUID(),
    items: [install()],
  });
  assert.equal(result.items[0].generation, 28);
  assert.equal(result.status, "completed");
});
test("worker rejects injected account names, extra fields, wrong fingerprints and conflicting revoke targets", async (t) => {
  const helper = helperMock(),
    worker = await createWorker({ config: config(), helper });
  t.after(() => worker.close());
  for (const item of [
    { ...install(), studentId: "../../root" },
    { ...install(), path: "/root/.ssh/authorized_keys" },
    { ...install(), fingerprint: "SHA256:wrong" },
  ])
    await assert.rejects(() =>
      worker.submit({ requestId: crypto.randomUUID(), items: [item] }),
    );
  const existing = install();
  await done(worker, { requestId: crypto.randomUUID(), items: [existing] });
  const wrong = install();
  const result = await done(worker, {
    requestId: crypto.randomUUID(),
    items: [
      {
        studentId: sid,
        serverId: "190",
        username: "stu" + sid,
        action: "revoke",
        publicKey: null,
        fingerprint: wrong.fingerprint,
      },
    ],
  });
  assert.equal(result.status, "failed");
  assert.equal(helper.states.get(sid).fingerprint, existing.fingerprint);
});
test("a database from a newer deployment is never silently downgraded", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "course-keys-schema-"));
  try {
    const filename = path.join(tmp, "future.sqlite3"),
      db = openDatabase(filename, true);
    db.pragma("user_version=99");
    db.close();
    assert.throws(() => openDatabase(filename, true), /newer/);
  } finally {
    assert.equal(path.dirname(path.resolve(tmp)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(tmp).startsWith("course-keys-schema-"));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test("revocation passes its expected fingerprint into the locked helper operation", async (t) => {
  const base = helperMock();
  let replacement, requestSeen;
  const helper = {
    async run(request) {
      if (request.operation === "apply" && request.action === "revoke") {
        requestSeen = request;
        const old = base.states.get(sid);
        base.states.set(sid, {
          generation: old.generation + 1,
          action: "install",
          publicKey: replacement.publicKey,
          fingerprint: replacement.fingerprint,
        });
      }
      return base.run(request);
    },
  };
  const worker = await createWorker({ config: config(), helper });
  t.after(() => worker.close());
  const original = install();
  await done(worker, { requestId: crypto.randomUUID(), items: [original] });
  replacement = install();
  worker.db
    .prepare("UPDATE targets SET generation=100 WHERE student_id=?")
    .run(sid);
  const revoked = await done(worker, {
    requestId: crypto.randomUUID(),
    items: [
      {
        studentId: sid,
        serverId: "190",
        username: "stu" + sid,
        action: "revoke",
        publicKey: null,
        fingerprint: original.fingerprint,
      },
    ],
  });
  assert.equal(requestSeen.expectedFingerprint, original.fingerprint);
  assert.equal(requestSeen.fingerprint, null);
  assert.equal(revoked.status, "failed");
  assert.equal(base.states.get(sid).fingerprint, replacement.fingerprint);
  assert.equal(base.applies.length, 1);
});
