import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PassThrough, Readable } from "node:stream";
import { createWorker } from "../src/worker-app.js";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { openDatabase } from "../src/db.js";
import { edKey, multipart, helperMock } from "./helpers.js";
const prefix = "/api/course-keys",
  origin = "http://localhost",
  sid = "0012345678";
async function fixture(t, overrides = {}) {
  const sent = [];
  const config = {
    ...loadConfig({
      NODE_ENV: "test",
      COURSE_KEYS_ORIGIN: origin,
      COURSE_KEYS_DB: ":memory:",
      COURSE_KEYS_ENROLLMENT_OPEN: "true",
      COURSE_KEYS_ADMIN_EMAILS: "admin@example.test",
      COURSE_KEYS_SECRET: "test-only-stable-secret-12345678901234567890",
    }),
    pollMs: 60_000,
    ...overrides.config,
  };
  const db = overrides.db || openDatabase(":memory:");
  const jobs = new Map();
  const importer = overrides.importer || {
    async check(ids) {
      return ids.map((target) => ({
        ...target,
        status: "ready",
        message: null,
      }));
    },
    async submit(body) {
      if (!jobs.has(body.requestId))
        jobs.set(body.requestId, {
          id: body.requestId,
          status: "completed",
          createdAt: new Date().toISOString(),
          items: body.items.map((i) => ({
            ...i,
            status: "success",
            error: null,
            generation: 1,
          })),
        });
      return jobs.get(body.requestId);
    },
    async get(id) {
      return jobs.get(id);
    },
  };
  const app = await createApp({
    config,
    db,
    mailer: {
      configured: true,
      async sendCode(mail) {
        sent.push(mail);
      },
    },
    importer,
  });
  t.after(async () => {
    await app.close();
    if (!overrides.db) db.close();
  });
  await app.ready();
  db.prepare(
    "INSERT OR IGNORE INTO students(student_id,name,email,username,server_id) VALUES(?,?,?,?,?)",
  ).run(sid, "模拟学生", sid + "@stu.pku.edu.cn", "stu" + sid, "190");
  const request = (method, url, body, auth, upload, extra = {}) =>
    app.inject({
      method,
      url: prefix + url,
      headers: {
        origin,
        ...(auth
          ? { cookie: auth.cookie, "x-csrf-token": auth.csrfToken }
          : {}),
        ...(upload ? { "content-type": upload.type } : {}),
        ...extra,
      },
      payload: upload ? upload.body : body,
    });
  async function login(role = "admin", identity = sid) {
    let r = await request(
      "POST",
      "/auth/request-code",
      role === "admin"
        ? { role, email: "admin@example.test" }
        : { role, studentId: identity },
    );
    assert.equal(r.statusCode, 200, r.body);
    r = await request("POST", "/auth/verify", {
      challengeId: r.json().challengeId,
      code: sent.at(-1).code,
    });
    assert.equal(r.statusCode, 200, r.body);
    return {
      cookie: r.headers["set-cookie"].split(";")[0],
      csrfToken: r.json().csrfToken,
    };
  }
  return { app, db, config, sent, jobs, importer, request, login };
}
test("closed enrollment is default; admin login works but students receive no code", async (t) => {
  const f = await fixture(t, { config: { enrollmentOpen: false } });
  assert.equal(loadConfig({ NODE_ENV: "test" }).enrollmentOpen, false);
  const r = await f.request("POST", "/auth/request-code", {
    role: "student",
    studentId: sid,
  });
  assert.equal(r.statusCode, 200);
  assert.equal(f.sent.length, 0);
  const admin = await f.login();
  assert.equal(
    (await f.request("GET", "/admin/students", null, admin)).statusCode,
    200,
  );
});
test("unknown identity response matches known response and OTP attempts are bounded", async (t) => {
  const f = await fixture(t);
  let r = await f.request("POST", "/auth/request-code", {
    role: "student",
    studentId: "0099999999",
  });
  assert.equal(r.statusCode, 200);
  const unknown = r.json();
  assert.equal(f.sent.length, 0);
  r = await f.request("POST", "/auth/request-code", {
    role: "student",
    studentId: sid,
  });
  assert.equal(r.json().message, unknown.message);
  const challengeId = r.json().challengeId,
    real = f.sent.at(-1).code,
    wrong = real === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await f.request("POST", "/auth/verify", { challengeId, code: wrong }))
        .statusCode,
      401,
    );
  assert.equal(
    (await f.request("POST", "/auth/verify", { challengeId, code: real }))
      .statusCode,
    401,
  );
});
test("student role cannot access roster exports and cannot claim another identity or target", async (t) => {
  const f = await fixture(t),
    auth = await f.login("student");
  assert.equal(
    (await f.request("GET", "/admin/students/export", null, auth)).statusCode,
    403,
  );
  let r = await f.request(
    "POST",
    "/me/key",
    null,
    auth,
    multipart("key.pub", edKey().key, { studentId: "0012345679" }),
  );
  assert.equal(r.statusCode, 403, r.body);
  r = await f.request(
    "POST",
    "/me/key",
    null,
    auth,
    multipart("key.pub", edKey().key, { username: "root" }),
  );
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM keys").get().n, 0);
  assert.equal(
    (
      await f.request(
        "POST",
        "/auth/request-code",
        { role: "admin", email: "admin@example.test" },
        null,
        null,
        { origin: "https://attacker.invalid" },
      )
    ).statusCode,
    403,
  );
});
test("private uploads never enter stored keys or audit detail; oversized requests fail as client errors", async (t) => {
  const f = await fixture(t),
    auth = await f.login("student");
  const privateText =
    "-----BEGIN OPENSSH PRIVATE KEY-----\nUNIQUE-SECRET-MARKER\n-----END OPENSSH PRIVATE KEY-----";
  let r = await f.request(
    "POST",
    "/me/key",
    null,
    auth,
    multipart("renamed.pub", privateText),
  );
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(r.json().error.code, "INVALID_KEY");
  assert.ok(!r.body.includes("UNIQUE-SECRET-MARKER"));
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM keys").get().n, 0);
  assert.ok(
    !JSON.stringify(f.db.prepare("SELECT * FROM audit").all()).includes(
      "UNIQUE-SECRET-MARKER",
    ),
  );
  r = await f.request(
    "POST",
    "/me/key",
    null,
    auth,
    multipart("oversized.pub", Buffer.alloc(20_000)),
  );
  assert.equal(r.statusCode, 413, r.body);
});
test("fresh authentication is required for approval without consuming its preview", async (t) => {
  const f = await fixture(t),
    admin = await f.login(),
    student = await f.login("student");
  assert.equal(
    (
      await f.request(
        "POST",
        "/me/key",
        null,
        student,
        multipart("key.pub", edKey().key),
      )
    ).statusCode,
    200,
  );
  const preview = (
    await f.request(
      "POST",
      "/admin/imports/preview",
      { studentIds: [sid] },
      admin,
    )
  ).json();
  f.db
    .prepare("UPDATE sessions SET verified_at=? WHERE role='admin'")
    .run(Date.now() - 11 * 60_000);
  const body = { previewId: preview.previewId, requestId: crypto.randomUUID() };
  const reply = await f.request("POST", "/admin/imports", body, admin);
  assert.equal(reply.statusCode, 403, reply.body);
  assert.equal(reply.json().error.code, "REAUTH_REQUIRED");
  assert.equal(
    f.db
      .prepare("SELECT consumed FROM previews WHERE id=?")
      .get(preview.previewId).consumed,
    0,
  );
  f.db
    .prepare("UPDATE sessions SET verified_at=? WHERE role='admin'")
    .run(Date.now());
  assert.equal(
    (await f.request("POST", "/admin/imports", body, admin)).statusCode,
    200,
  );
  await f.app.synchronize();
  assert.equal(f.jobs.size, 1);
});
test("durable outbox survives a web restart before importer acknowledgement", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  let unavailable = true;
  const jobs = new Map(),
    importer = {
      async check(ids) {
        return ids.map((target) => ({
          ...target,
          status: "ready",
          message: null,
        }));
      },
      async submit(body) {
        if (unavailable) throw new Error("Temporary transport loss");
        const result = {
          id: body.requestId,
          status: "completed",
          createdAt: new Date().toISOString(),
          items: body.items.map((i) => ({
            ...i,
            status: "success",
            error: null,
            generation: 1,
          })),
        };
        jobs.set(result.id, result);
        return result;
      },
      async get(id) {
        return jobs.get(id);
      },
    };
  const f = await fixture(t, { db, importer }),
    admin = await f.login(),
    student = await f.login("student");
  await f.request(
    "POST",
    "/me/key",
    null,
    student,
    multipart("key.pub", edKey().key),
  );
  const preview = (
    await f.request(
      "POST",
      "/admin/imports/preview",
      { studentIds: [sid] },
      admin,
    )
  ).json();
  const batch = (
    await f.request(
      "POST",
      "/admin/imports",
      { previewId: preview.previewId, requestId: crypto.randomUUID() },
      admin,
    )
  ).json();
  await f.app.synchronize();
  assert.equal(
    db.prepare("SELECT status FROM batch_items WHERE batch_id=?").get(batch.id)
      .status,
    "queued",
  );
  await f.app.close();
  unavailable = false;
  const restarted = await createApp({
    config: f.config,
    db,
    mailer: { configured: true, async sendCode() {} },
    importer,
  });
  t.after(() => restarted.close());
  await restarted.synchronize();
  assert.equal(
    db.prepare("SELECT status FROM batch_items WHERE batch_id=?").get(batch.id)
      .status,
    "success",
  );
  assert.equal(jobs.size, 1);
});
test("chunked multipart bodies are bounded even without Content-Length", async (t) => {
  const f = await fixture(t),
    auth = await f.login("student"),
    upload = multipart("large.pub", Buffer.alloc(20_000));
  const reply = await f.app.inject({
    method: "POST",
    url: prefix + "/me/key",
    headers: {
      origin,
      cookie: auth.cookie,
      "x-csrf-token": auth.csrfToken,
      "content-type": upload.type,
      "transfer-encoding": "chunked",
    },
    payload: Readable.from([
      upload.body.subarray(0, 8000),
      upload.body.subarray(8000),
    ]),
  });
  assert.equal(reply.statusCode, 413, reply.body);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM keys").get().n, 0);
});
test("API approvals integrate with worker install, revoke, and restore at increasing generations", async (t) => {
  const helper = helperMock(),
    worker = await createWorker({
      config: {
        ...loadConfig({
          NODE_ENV: "test",
          COURSE_KEYS_IMPORTER_DB: ":memory:",
        }),
        pollMs: 60_000,
      },
      helper,
    });
  const importer = {
    async check(ids) {
      return (
        await worker.inject({
          method: "POST",
          url: "/check",
          payload: { targets: ids },
        })
      ).json().accounts;
    },
    submit: (body) => worker.submit(body),
    async get(id) {
      return (await worker.inject({ url: "/jobs/" + id })).json();
    },
  };
  const f = await fixture(t, { importer });
  t.after(() => worker.close());
  const admin = await f.login(),
    student = await f.login("student");
  const uploaded = await f.request(
    "POST",
    "/me/key",
    null,
    student,
    multipart("key.pub", edKey().key),
  );
  const keyId = uploaded.json().student.latestKey.id;
  async function approve(previewUrl, previewBody, commitUrl) {
    const preview = await f.request("POST", previewUrl, previewBody, admin);
    assert.equal(preview.statusCode, 200, preview.body);
    assert.equal(preview.json().items[0].eligible, true);
    const batch = await f.request(
      "POST",
      commitUrl,
      { previewId: preview.json().previewId, requestId: crypto.randomUUID() },
      admin,
    );
    assert.equal(batch.statusCode, 200, batch.body);
    for (let i = 0; i < 3; i++) {
      await f.app.synchronize();
      await worker.processJobs();
    }
    const result = await f.request(
      "GET",
      "/admin/imports/" + batch.json().id,
      null,
      admin,
    );
    assert.equal(result.json().status, "completed", result.body);
  }
  await approve(
    "/admin/imports/preview",
    { studentIds: [sid] },
    "/admin/imports",
  );
  assert.equal(helper.states.get(sid).generation, 1);
  assert.equal(
    (await f.request("GET", "/me", null, student)).json().student.installedKey
      .id,
    keyId,
  );
  await approve(
    "/admin/key-actions/preview",
    { studentId: sid, action: "revoke" },
    "/admin/key-actions",
  );
  assert.equal(helper.states.get(sid).generation, 2);
  assert.equal(
    (await f.request("GET", "/me", null, student)).json().student.importStatus,
    "revoked",
  );
  await approve(
    "/admin/key-actions/preview",
    { studentId: sid, action: "restore", keyId },
    "/admin/key-actions",
  );
  assert.equal(helper.states.get(sid).generation, 3);
  assert.equal(
    (await f.request("GET", "/me", null, student)).json().student.installedKey
      .id,
    keyId,
  );
});
test("a later approved revocation supersedes an earlier failed installation even without a new upload", async (t) => {
  let failNext = false;
  const jobs = new Map();
  const importer = {
    async check(ids) {
      return ids.map((target) => ({
        ...target,
        status: "ready",
        message: null,
      }));
    },
    async submit(body) {
      const status = failNext ? "failed" : "success";
      const result = {
        id: body.requestId,
        status: failNext ? "failed" : "completed",
        createdAt: new Date().toISOString(),
        items: body.items.map((i) => ({
          ...i,
          status,
          error: failNext ? "临时安装失败" : null,
          generation: jobs.size + 1,
        })),
      };
      jobs.set(result.id, result);
      return result;
    },
    async get(id) {
      return jobs.get(id);
    },
  };
  const f = await fixture(t, { importer }),
    admin = await f.login(),
    student = await f.login("student");
  async function approve(previewPath, previewBody, commitPath) {
    const preview = await f.request("POST", previewPath, previewBody, admin);
    assert.equal(preview.statusCode, 200, preview.body);
    const result = await f.request(
      "POST",
      commitPath,
      { previewId: preview.json().previewId, requestId: crypto.randomUUID() },
      admin,
    );
    assert.equal(result.statusCode, 200, result.body);
    await f.app.synchronize();
    return result.json();
  }
  await f.request(
    "POST",
    "/me/key",
    null,
    student,
    multipart("first.pub", edKey().key),
  );
  await approve(
    "/admin/imports/preview",
    { studentIds: [sid] },
    "/admin/imports",
  );
  await f.request(
    "POST",
    "/me/key",
    null,
    student,
    multipart("replacement.pub", edKey().key),
  );
  failNext = true;
  const failed = await approve(
    "/admin/imports/preview",
    { studentIds: [sid] },
    "/admin/imports",
  );
  assert.equal(
    (await f.request("GET", "/admin/imports/" + failed.id, null, admin)).json()
      .status,
    "failed",
  );
  failNext = false;
  await approve(
    "/admin/key-actions/preview",
    { studentId: sid, action: "revoke" },
    "/admin/key-actions",
  );
  const retry = await f.request(
    "POST",
    "/admin/imports/" + failed.id + "/retry",
    { requestId: crypto.randomUUID() },
    admin,
  );
  assert.equal(retry.statusCode, 409, retry.body);
  assert.equal(retry.json().error.code, "SUPERSEDED");
  assert.equal(jobs.size, 3);
  assert.equal(
    (await f.request("GET", "/me", null, student)).json().student.installedKey,
    null,
  );
});
test("an unchanged failed approval can retry once and its stable request remains idempotent", async (t) => {
  let failNext = true;
  const jobs = new Map();
  const importer = {
    async check(ids) {
      return ids.map((target) => ({
        ...target,
        status: "ready",
        message: null,
      }));
    },
    async submit(body) {
      const status = failNext ? "failed" : "success";
      const result = {
        id: body.requestId,
        status: failNext ? "failed" : "completed",
        createdAt: new Date().toISOString(),
        items: body.items.map((i) => ({
          ...i,
          status,
          error: failNext ? "临时失败" : null,
          generation: jobs.size + 1,
        })),
      };
      jobs.set(result.id, result);
      return result;
    },
    async get(id) {
      return jobs.get(id);
    },
  };
  const f = await fixture(t, { importer }),
    admin = await f.login(),
    student = await f.login("student");
  await f.request(
    "POST",
    "/me/key",
    null,
    student,
    multipart("key.pub", edKey().key),
  );
  const preview = await f.request(
    "POST",
    "/admin/imports/preview",
    { studentIds: [sid] },
    admin,
  );
  const original = await f.request(
    "POST",
    "/admin/imports",
    { previewId: preview.json().previewId, requestId: crypto.randomUUID() },
    admin,
  );
  await f.app.synchronize();
  const revision = f.db
    .prepare("SELECT revision FROM students WHERE student_id=?")
    .get(sid).revision;
  failNext = false;
  const payload = { requestId: crypto.randomUUID() };
  const retry = await f.request(
    "POST",
    "/admin/imports/" + original.json().id + "/retry",
    payload,
    admin,
  );
  assert.equal(retry.statusCode, 200, retry.body);
  await f.app.synchronize();
  assert.equal(
    f.db.prepare("SELECT revision FROM students WHERE student_id=?").get(sid)
      .revision,
    revision + 1,
  );
  assert.equal(
    (
      await f.request(
        "POST",
        "/admin/imports/" + original.json().id + "/retry",
        payload,
        admin,
      )
    ).json().id,
    retry.json().id,
  );
  assert.equal(jobs.size, 2);
});
async function lifecycle(f, admin, action, studentIds = [sid]) {
  const preview = await f.request(
    "POST",
    "/admin/students/" + action + "-preview",
    { studentIds },
    admin,
  );
  assert.equal(preview.statusCode, 200, preview.body);
  const confirmed = await f.request(
    "POST",
    "/admin/students/" + action + "-confirm",
    { previewId: preview.json().previewId },
    admin,
  );
  return { preview, confirmed };
}
async function rosterPreview(f, admin, serverId, name = "模拟学生") {
  return f.request(
    "POST",
    "/admin/roster/preview",
    null,
    admin,
    multipart("roster.csv", `学号,姓名,服务器号\n${sid},${name},${serverId}\n`),
  );
}
async function approveKey(f, admin, action = "install") {
  const path = action === "install" ? "/admin/imports" : "/admin/key-actions";
  const preview = await f.request(
    "POST",
    path + "/preview",
    action === "install" ? { studentIds: [sid] } : { studentId: sid, action },
    admin,
  );
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(preview.json().items[0].eligible, true, preview.body);
  const batch = await f.request(
    "POST",
    path,
    { previewId: preview.json().previewId, requestId: crypto.randomUUID() },
    admin,
  );
  assert.equal(batch.statusCode, 200, batch.body);
  await f.app.synchronize();
  return batch.json();
}
test("soft removal revokes web credentials, preserves history and key ownership, and requires explicit reactivation", async (t) => {
  const f = await fixture(t),
    admin = await f.login(),
    student = await f.login("student"),
    key = edKey().key;
  assert.equal(
    (
      await f.request(
        "POST",
        "/me/key",
        null,
        student,
        multipart("key.pub", key),
      )
    ).statusCode,
    200,
  );
  // Advance only the mock rate window so a second, unconsumed code can coexist with this session.
  f.db.prepare("UPDATE rates SET expires_at=0").run();
  const challenge = await f.request("POST", "/auth/request-code", {
    role: "student",
    studentId: sid,
  });
  const pendingCode = {
    challengeId: challenge.json().challengeId,
    code: f.sent.at(-1).code,
  };
  const removed = await lifecycle(f, admin, "remove");
  assert.equal(removed.confirmed.statusCode, 200, removed.confirmed.body);
  assert.equal(removed.confirmed.json().count, 1);
  const activeList = (
    await f.request("GET", "/admin/students", null, admin)
  ).json();
  assert.equal(activeList.students.length, 0);
  assert.equal(activeList.stats.removed, 1);
  const archived = (
    await f.request("GET", "/admin/students?includeRemoved=true", null, admin)
  ).json();
  assert.equal(archived.students.length, 1);
  assert.ok(archived.students[0].removedAt);
  assert.equal(archived.students[0].removedBy, "admin@example.test");
  assert.equal(archived.stats.total, 0);
  assert.equal((await f.request("GET", "/me", null, student)).statusCode, 401);
  assert.equal(
    (
      await f.request(
        "POST",
        "/me/key",
        null,
        student,
        multipart("key.pub", key),
      )
    ).statusCode,
    401,
  );
  assert.equal(
    (await f.request("POST", "/auth/verify", pendingCode)).statusCode,
    401,
  );
  f.db.prepare("UPDATE rates SET expires_at=0").run();
  const sentCount = f.sent.length;
  assert.equal(
    (
      await f.request("POST", "/auth/request-code", {
        role: "student",
        studentId: sid,
      })
    ).statusCode,
    200,
  );
  assert.equal(f.sent.length, sentCount);
  const history = await f.request(
    "GET",
    "/admin/students/" + sid + "/keys",
    null,
    admin,
  );
  assert.equal(history.statusCode, 200);
  assert.equal(history.json().keys[0].publicKey, key);
  const reimport = await rosterPreview(f, admin, "190");
  assert.equal(reimport.statusCode, 200);
  assert.equal(reimport.json().previewId, null);
  assert.ok(reimport.json().errors.some((e) => e.field === "studentId"));
  const other = "0012345679";
  f.db
    .prepare(
      "INSERT INTO students(student_id,name,email,username,server_id) VALUES(?,'另一学生',?,?,'132')",
    )
    .run(other, other + "@stu.pku.edu.cn", "stu" + other);
  const otherSession = await f.login("student", other);
  const borrowed = await f.request(
    "POST",
    "/me/key",
    null,
    otherSession,
    multipart("borrowed.pub", key),
  );
  assert.equal(borrowed.statusCode, 409);
  assert.equal(borrowed.json().error.code, "KEY_ALREADY_ASSIGNED");
  const restored = await lifecycle(f, admin, "restore");
  assert.equal(restored.confirmed.statusCode, 200, restored.confirmed.body);
  assert.equal(f.jobs.size, 0);
  assert.equal((await f.request("GET", "/me", null, student)).statusCode, 401);
  assert.equal(
    (await f.request("POST", "/auth/verify", pendingCode)).statusCode,
    401,
  );
  f.db.prepare("UPDATE rates SET expires_at=0").run();
  const newSession = await f.login("student");
  const me = (await f.request("GET", "/me", null, newSession)).json().student;
  assert.equal(me.removedAt, null);
  assert.equal(me.accountStatus, "unchecked");
  assert.equal(me.installedKey, null);
  assert.equal(me.importStatus, "pending_review");
  assert.equal(me.latestKey.publicKey, key);
  const repeated = await f.request(
    "POST",
    "/admin/students/remove-confirm",
    { previewId: removed.preview.json().previewId },
    admin,
  );
  assert.equal(repeated.statusCode, 200);
  assert.equal(
    f.db.prepare("SELECT removed_at FROM students WHERE student_id=?").get(sid)
      .removed_at,
    null,
    "an old confirmation replay must not remove a restored student",
  );
  assert.deepEqual(
    f.db
      .prepare(
        "SELECT event FROM audit WHERE event IN ('student_removed','student_restored') ORDER BY id",
      )
      .all()
      .map((r) => r.event),
    ["student_removed", "student_restored"],
  );
});
test("removal never auto-revokes installed keys; manual verified revocation enables removal", async (t) => {
  const f = await fixture(t),
    admin = await f.login(),
    student = await f.login("student");
  await f.request(
    "POST",
    "/me/key",
    null,
    student,
    multipart("key.pub", edKey().key),
  );
  await approveKey(f, admin);
  const denied = await lifecycle(f, admin, "remove");
  assert.equal(denied.preview.json().items[0].eligible, false);
  assert.equal(denied.confirmed.statusCode, 409);
  assert.equal(f.jobs.size, 1);
  assert.equal(
    f.db.prepare("SELECT removed_at FROM students WHERE student_id=?").get(sid)
      .removed_at,
    null,
  );
  const change = await rosterPreview(f, admin, "197");
  assert.equal(change.json().previewId, null);
  assert.ok(change.json().errors.some((e) => e.field === "serverId"));
  await approveKey(f, admin, "revoke");
  const removed = await lifecycle(f, admin, "remove");
  assert.equal(removed.confirmed.statusCode, 200, removed.confirmed.body);
  assert.equal(
    f.jobs.size,
    2,
    "remove itself must not create a third importer job",
  );
});
test("server reassignment invalidates previews, resets account checks, and freezes the new target in jobs", async (t) => {
  const f = await fixture(t),
    admin = await f.login(),
    student = await f.login("student");
  await f.request(
    "POST",
    "/me/key",
    null,
    student,
    multipart("key.pub", edKey().key),
  );
  const before = await f.request(
    "POST",
    "/admin/imports/preview",
    { studentIds: [sid] },
    admin,
  );
  assert.equal(before.json().items[0].serverId, "190");
  const changed = await rosterPreview(f, admin, "132");
  assert.deepEqual(changed.json().errors, []);
  assert.equal(changed.json().rows[0].change, "update");
  assert.equal(changed.json().rows[0].username, "stu" + sid);
  const commit = await f.request(
    "POST",
    "/admin/roster/commit",
    { previewId: changed.json().previewId },
    admin,
  );
  assert.equal(commit.statusCode, 200, commit.body);
  assert.equal(
    f.db
      .prepare("SELECT account_status FROM students WHERE student_id=?")
      .get(sid).account_status,
    "unchecked",
  );
  const stale = await f.request(
    "POST",
    "/admin/imports",
    { previewId: before.json().previewId, requestId: crypto.randomUUID() },
    admin,
  );
  assert.equal(stale.statusCode, 409);
  const batch = await approveKey(f, admin);
  const snapshot = f.db
    .prepare("SELECT server_id,username FROM batch_items WHERE batch_id=?")
    .get(batch.id);
  assert.deepEqual(snapshot, { server_id: "132", username: "stu" + sid });
  assert.equal([...f.jobs.values()][0].items[0].serverId, "132");
  assert.equal([...f.jobs.values()][0].items[0].username, "stu" + sid);
  const duplicate = await rosterPreview(f, admin, "132");
  assert.equal(duplicate.json().rows[0].change, "unchanged");
  assert.equal(
    (
      await f.request(
        "POST",
        "/admin/roster/commit",
        { previewId: duplicate.json().previewId },
        admin,
      )
    ).statusCode,
    200,
  );
  assert.equal(f.jobs.size, 1);
});
test("account checks cannot mark a different server ready after a concurrent reassignment", async (t) => {
  let app;
  const importer = {
    async check(targets) {
      app.db
        .prepare(
          "UPDATE students SET server_id='197',revision=revision+1 WHERE student_id=?",
        )
        .run(sid);
      return targets.map((target) => ({
        ...target,
        status: "ready",
        message: null,
      }));
    },
    async submit() {
      throw new Error("not expected");
    },
    async get() {
      throw new Error("not expected");
    },
  };
  const f = await fixture(t, { importer });
  app = f.app;
  const admin = await f.login();
  const response = await f.request(
    "POST",
    "/admin/students/check",
    { studentIds: [sid] },
    admin,
  );
  assert.equal(response.statusCode, 409, response.body);
  assert.equal(response.json().error.code, "STALE_TARGET");
  assert.equal(
    f.db
      .prepare("SELECT account_status FROM students WHERE student_id=?")
      .get(sid).account_status,
    "unchecked",
  );
});
test("removal confirmation rechecks revisions and requires fresh administrator authentication", async (t) => {
  const f = await fixture(t),
    admin = await f.login(),
    student = await f.login("student");
  let preview = await f.request(
    "POST",
    "/admin/students/remove-preview",
    { studentIds: [sid] },
    admin,
  );
  await f.request(
    "POST",
    "/me/key",
    null,
    student,
    multipart("key.pub", edKey().key),
  );
  let response = await f.request(
    "POST",
    "/admin/students/remove-confirm",
    { previewId: preview.json().previewId },
    admin,
  );
  assert.equal(response.statusCode, 409);
  assert.equal(
    f.db.prepare("SELECT removed_at FROM students WHERE student_id=?").get(sid)
      .removed_at,
    null,
  );
  preview = await f.request(
    "POST",
    "/admin/students/remove-preview",
    { studentIds: [sid] },
    admin,
  );
  f.db
    .prepare("UPDATE sessions SET verified_at=? WHERE role='admin'")
    .run(Date.now() - 11 * 60_000);
  response = await f.request(
    "POST",
    "/admin/students/remove-confirm",
    { previewId: preview.json().previewId },
    admin,
  );
  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error.code, "REAUTH_REQUIRED");
  assert.equal(
    f.db
      .prepare("SELECT consumed FROM previews WHERE id=?")
      .get(preview.json().previewId).consumed,
    0,
  );
});
test("unverified failures block removal and reassignment even when an account existence check succeeds", async (t) => {
  const f = await fixture(t),
    admin = await f.login();
  f.db
    .prepare(
      "INSERT INTO batches(id,request_id,preview_id,admin_email,created_at) VALUES('uncertain','uncertain','uncertain','admin@example.test','now')",
    )
    .run();
  f.db
    .prepare(
      "INSERT INTO batch_items(batch_id,student_id,server_id,username,action,revision,status,generation) VALUES('uncertain',?,'190',?,'install',0,'failed',7)",
    )
    .run(sid, "stu" + sid);
  assert.equal(
    (
      await f.request(
        "POST",
        "/admin/students/check",
        { studentIds: [sid] },
        admin,
      )
    ).statusCode,
    200,
  );
  const removal = await lifecycle(f, admin, "remove");
  assert.equal(removal.preview.json().items[0].eligible, false);
  assert.equal(removal.confirmed.statusCode, 409);
  const change = await rosterPreview(f, admin, "197");
  assert.equal(change.json().previewId, null);
  assert.ok(change.json().errors.some((e) => e.field === "serverId"));
});

for (const reactivate of [false, true]) {
  test(`an in-flight upload cannot commit after student removal${reactivate ? " and reactivation" : ""}`, async (t) => {
    const f = await fixture(t),
      admin = await f.login(),
      student = await f.login("student"),
      upload = multipart("key.pub", edKey().key),
      stream = new PassThrough();
    const responsePromise = f.request("POST", "/me/key", null, student, {
      type: upload.type,
      body: stream,
    });
    stream.write(upload.body.subarray(0, upload.body.length - 8));
    try {
      // The rate row is written after session validation and before awaiting the file.
      const deadline = Date.now() + 2000;
      while (
        !f.db.prepare("SELECT 1 FROM rates WHERE bucket=?").get("upload:" + sid)
      ) {
        assert.ok(
          Date.now() < deadline,
          "upload handler must reach its file await",
        );
        await new Promise((resolve) => setImmediate(resolve));
      }
      const removed = await lifecycle(f, admin, "remove");
      assert.equal(removed.confirmed.statusCode, 200, removed.confirmed.body);
      if (reactivate) {
        const restored = await lifecycle(f, admin, "restore");
        assert.equal(
          restored.confirmed.statusCode,
          200,
          restored.confirmed.body,
        );
      }
    } finally {
      stream.end(upload.body.subarray(upload.body.length - 8));
    }
    const response = await responsePromise;
    assert.equal(response.statusCode, 401, response.body);
    assert.equal(response.json().error.code, "UNAUTHENTICATED");
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM keys").get().n, 0);
    const row = f.db
      .prepare(
        "SELECT latest_key_id,revision,removed_at FROM students WHERE student_id=?",
      )
      .get(sid);
    assert.equal(row.latest_key_id, null);
    assert.equal(row.revision, reactivate ? 2 : 1);
    assert.equal(Boolean(row.removed_at), !reactivate);
  });
}

test("a pending account check cannot overwrite the reset state after same-target removal and reactivation", async (t) => {
  const started = Promise.withResolvers(),
    release = Promise.withResolvers();
  const importer = {
    async check(targets) {
      started.resolve(targets);
      await release.promise;
      return targets.map((target) => ({
        ...target,
        status: "ready",
        message: null,
      }));
    },
    async submit() {
      throw new Error("not expected");
    },
    async get() {
      throw new Error("not expected");
    },
  };
  const f = await fixture(t, { importer }),
    admin = await f.login();
  const pending = f.request(
    "POST",
    "/admin/students/check",
    { studentIds: [sid] },
    admin,
  );
  assert.deepEqual(await started.promise, [
    { studentId: sid, serverId: "190", username: "stu" + sid },
  ]);
  try {
    const removed = await lifecycle(f, admin, "remove");
    assert.equal(removed.confirmed.statusCode, 200, removed.confirmed.body);
    const restored = await lifecycle(f, admin, "restore");
    assert.equal(restored.confirmed.statusCode, 200, restored.confirmed.body);
  } finally {
    release.resolve();
  }
  const stale = await pending;
  assert.equal(stale.statusCode, 409, stale.body);
  assert.equal(stale.json().error.code, "STALE_TARGET");
  const row = f.db
    .prepare("SELECT account_status,revision FROM students WHERE student_id=?")
    .get(sid);
  assert.deepEqual(row, { account_status: "unchecked", revision: 2 });
  const fresh = await f.request(
    "POST",
    "/admin/students/check",
    { studentIds: [sid] },
    admin,
  );
  assert.equal(fresh.statusCode, 200, fresh.body);
  assert.equal(fresh.json().students[0].accountStatus, "ready");
});
