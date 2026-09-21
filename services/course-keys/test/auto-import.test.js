import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { openDatabase } from "../src/db.js";
import { edKey, multipart } from "./helpers.js";

const prefix = "/api/course-keys";
const origin = "http://localhost";
const sid = "0012345678";
const secondId = "0012345679";
const adminEmail = "automatic-admin@example.test";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function importerMock() {
  const jobs = new Map();
  const checks = [];
  const submissions = [];
  const generations = new Map();
  return {
    jobs,
    checks,
    submissions,
    status: "ready",
    checkOverride: null,
    submitOverride: null,
    async check(targets) {
      checks.push(structuredClone(targets));
      if (this.checkOverride) return this.checkOverride(targets);
      return targets.map((target) => ({
        ...target,
        status: this.status,
        message: this.status === "ready" ? null : "模拟账号尚未准备好",
      }));
    },
    async submit(body) {
      if (jobs.has(body.requestId)) return jobs.get(body.requestId);
      submissions.push(structuredClone(body));
      const result = {
        id: body.requestId,
        status: "completed",
        createdAt: new Date().toISOString(),
        items: body.items.map((item) => {
          const target = item.serverId + ":" + item.username;
          const generation = (generations.get(target) || 0) + 1;
          generations.set(target, generation);
          return { ...item, status: "success", error: null, generation };
        }),
      };
      if (this.submitOverride) await this.submitOverride(result, body);
      jobs.set(body.requestId, result);
      return result;
    },
    async get(id) {
      return jobs.get(id);
    },
  };
}

async function fixture(t, options = {}) {
  const db = options.db || openDatabase(":memory:");
  const importer = options.importer || importerMock();
  const sent = [];
  const config = {
    ...loadConfig({
      NODE_ENV: "test",
      COURSE_KEYS_ORIGIN: origin,
      COURSE_KEYS_DB: ":memory:",
      COURSE_KEYS_ENROLLMENT_OPEN: "true",
      COURSE_KEYS_ADMIN_EMAILS: adminEmail,
      COURSE_KEYS_SECRET: "automatic-import-local-test-secret-12345678901234567890",
    }),
    pollMs: 60_000,
    ...options.config,
  };
  const app = await createApp({
    config,
    db,
    importer,
    mailer: {
      configured: true,
      async sendCode(message) { sent.push(message); },
    },
  });
  t.after(async () => {
    await app.close();
    if (!options.db) db.close();
  });
  await app.ready();
  for (const studentId of [sid, secondId])
    db.prepare(
      "INSERT OR IGNORE INTO students(student_id,name,email,username,server_id) VALUES(?,?,?,?,?)",
    ).run(studentId, "模拟学生", studentId + "@stu.pku.edu.cn", "stu" + studentId, "190");

  const request = (method, route, body, auth, upload, headers = {}) =>
    app.inject({
      method,
      url: prefix + route,
      headers: {
        origin,
        ...(auth ? { cookie: auth.cookie, "x-csrf-token": auth.csrfToken } : {}),
        ...(upload ? { "content-type": upload.type } : {}),
        ...headers,
      },
      payload: upload ? upload.body : body,
    });
  const authCache = new Map();
  async function login(role = "admin", studentId = sid) {
    const identity = role === "admin" ? adminEmail : studentId;
    if (authCache.has(identity)) return authCache.get(identity);
    const code = await request("POST", "/auth/request-code",
      role === "admin" ? { role, email: identity } : { role, studentId });
    assert.equal(code.statusCode, 200, code.body);
    const verified = await request("POST", "/auth/verify", {
      challengeId: code.json().challengeId,
      code: sent.at(-1).code,
    });
    assert.equal(verified.statusCode, 200, verified.body);
    const auth = {
      cookie: verified.headers["set-cookie"].split(";")[0],
      csrfToken: verified.json().csrfToken,
    };
    authCache.set(identity, auth);
    return auth;
  }
  async function settings() {
    const response = await request("GET", "/admin/auto-import", null, await login());
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  }
  async function setEnabled(enabled) {
    const current = await settings();
    const response = await request("PUT", "/admin/auto-import", {
      enabled, revision: current.revision,
    }, await login());
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  }
  async function upload(key = edKey().key, studentId = sid) {
    const response = await request(
      "POST", "/me/key", null, await login("student", studentId),
      multipart("key.pub", key),
    );
    assert.equal(response.statusCode, 200, response.body);
    return response.json().student;
  }
  async function student(studentId = sid) {
    const response = await request("GET", "/me", null, await login("student", studentId));
    assert.equal(response.statusCode, 200, response.body);
    return response.json().student;
  }
  async function tick() {
    await app.processAutoImports();
    await app.synchronize();
  }
  function due() {
    db.prepare("UPDATE auto_import_candidates SET next_attempt_at=0").run();
  }
  async function approve(action = "install", studentIds = [sid], keyId) {
    const endpoint = action === "install" ? "/admin/imports" : "/admin/key-actions";
    const preview = await request("POST", endpoint + "/preview",
      action === "install"
        ? { studentIds }
        : { studentId: studentIds[0], action, ...(keyId ? { keyId } : {}) },
      await login());
    assert.equal(preview.statusCode, 200, preview.body);
    assert.ok(preview.json().items.some((item) => item.eligible), preview.body);
    const response = await request("POST", endpoint, {
      previewId: preview.json().previewId,
      requestId: crypto.randomUUID(),
    }, await login());
    assert.equal(response.statusCode, 200, response.body);
    await app.synchronize();
    return response.json();
  }
  async function removeStudent(studentId = sid) {
    const preview = await request("POST", "/admin/students/remove-preview", {
      studentIds: [studentId],
    }, await login());
    assert.equal(preview.statusCode, 200, preview.body);
    const response = await request("POST", "/admin/students/remove-confirm", {
      previewId: preview.json().previewId,
    }, await login());
    assert.equal(response.statusCode, 200, response.body);
  }
  async function changeTarget(serverId) {
    const preview = await request(
      "POST", "/admin/roster/preview", null, await login(),
      multipart("roster.csv", "学号,姓名,服务器号\n" + sid + ",模拟学生," + serverId + "\n"),
    );
    assert.equal(preview.statusCode, 200, preview.body);
    assert.ok(preview.json().previewId, preview.body);
    const response = await request("POST", "/admin/roster/commit", {
      previewId: preview.json().previewId,
    }, await login());
    assert.equal(response.statusCode, 200, response.body);
  }
  return {
    app, db, config, importer, request, login, settings, setEnabled,
    upload, student, tick, due, approve, removeStudent, changeTarget,
  };
}

test("automatic import starts disabled and setting changes require a fresh administrator, CSRF, and matching revision", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request("GET", "/admin/auto-import")).statusCode, 401);
  const studentAuth = await f.login("student");
  assert.equal(
    (await f.request("GET", "/admin/auto-import", null, studentAuth)).statusCode,
    403,
  );
  const initial = await f.settings();
  assert.deepEqual(initial, {
    enabled: false, revision: 0, updatedAt: null, updatedBy: null,
  });
  const view = await f.student();
  assert.deepEqual(view.autoImport, { status: null, message: null });
  assert.equal(view.autoImportBlocked, false);
  const body = { enabled: true, revision: 0 };
  assert.equal(
    (await f.request("PUT", "/admin/auto-import", body, studentAuth)).statusCode,
    403,
  );
  const admin = await f.login();
  assert.equal(
    (await f.request("PUT", "/admin/auto-import", body, admin, null,
      { "x-csrf-token": "wrong" })).statusCode,
    403,
  );
  assert.equal(
    (await f.request("PUT", "/admin/auto-import", body, admin, null,
      { origin: "https://invalid.example" })).statusCode,
    403,
  );
  f.db.prepare("UPDATE sessions SET verified_at=? WHERE role='admin'")
    .run(Date.now() - 11 * 60_000);
  const staleAuth = await f.request("PUT", "/admin/auto-import", body, admin);
  assert.equal(staleAuth.statusCode, 403, staleAuth.body);
  assert.equal(staleAuth.json().error.code, "REAUTH_REQUIRED");
  assert.deepEqual(await f.settings(), initial);
  f.db.prepare("UPDATE sessions SET verified_at=? WHERE role='admin'").run(Date.now());
  for (const invalid of [
    { enabled: "true", revision: 0 },
    { enabled: true, revision: -1 },
    { enabled: true, revision: 0.5 },
    { enabled: true },
    { enabled: true, revision: 0, studentId: sid },
  ]) {
    const response = await f.request("PUT", "/admin/auto-import", invalid, admin);
    assert.equal(response.statusCode, 400, response.body);
  }
  const changed = await f.setEnabled(true);
  assert.equal(changed.enabled, true);
  assert.equal(changed.revision, 1);
  assert.equal(changed.updatedBy, adminEmail);
  assert.ok(Number.isFinite(Date.parse(changed.updatedAt)));
  const conflict = await f.request("PUT", "/admin/auto-import", {
    enabled: false, revision: 0,
  }, admin);
  assert.equal(conflict.statusCode, 409, conflict.body);
  assert.equal(conflict.json().error.code, "STALE_AUTO_IMPORT_SETTINGS");
  assert.deepEqual(await f.settings(), changed);
});

test("enabling imports only new valid uploads; first and replacement keys install automatically, while old and duplicate keys do not", async (t) => {
  const f = await fixture(t);
  const oldKey = edKey().key;
  await f.upload(oldKey);
  await f.tick();
  assert.equal(f.importer.submissions.length, 0);
  await f.setEnabled(true);
  await f.tick();
  assert.equal(f.importer.submissions.length, 0, "enabling must not scan old keys");
  await f.upload(oldKey);
  await f.tick();
  assert.equal(f.importer.submissions.length, 0, "duplicate upload is not a new candidate");
  const privateKey = "-----BEGIN OPENSSH PRIVATE KEY-----\nLOCAL-TEST\n-----END OPENSSH PRIVATE KEY-----";
  const invalid = await f.request(
    "POST", "/me/key", null, await f.login("student"), multipart("key.pub", privateKey),
  );
  assert.equal(invalid.statusCode, 400, invalid.body);
  await f.tick();
  assert.equal(f.importer.submissions.length, 0);

  const first = await f.upload();
  await f.tick();
  assert.equal((await f.student()).installedKey.id, first.latestKey.id);
  assert.equal(f.importer.submissions.length, 1);
  const replacement = await f.upload();
  await f.tick();
  const after = await f.student();
  assert.equal(after.installedKey.id, replacement.latestKey.id);
  assert.equal(after.importStatus, "installed");
  assert.deepEqual(after.autoImport, { status: null, message: null });
  assert.equal(f.importer.submissions.length, 2);
  const batches = await f.request("GET", "/admin/imports", null, await f.login());
  assert.ok(batches.json().batches.every((batch) => batch.source === "automatic"));
  await f.upload(replacement.latestKey.publicKey);
  await f.tick();
  assert.equal(f.importer.submissions.length, 2);
});

for (const status of ["unknown", "missing", "unauthorized"]) {
  test("automatic import waits and rate limits checks for " + status + " accounts, then installs the same upload when ready", async (t) => {
    const f = await fixture(t);
    f.importer.status = status;
    await f.setEnabled(true);
    const uploaded = await f.upload();
    await f.tick();
    const waiting = await f.student();
    assert.equal(waiting.autoImport.status, "waiting");
    assert.equal(typeof waiting.autoImport.message, "string");
    assert.ok(waiting.autoImport.message.length > 0);
    assert.equal(f.importer.submissions.length, 0);
    const checks = f.importer.checks.length;
    assert.ok(checks >= 1);
    await f.tick();
    await f.tick();
    assert.equal(f.importer.checks.length, checks, "waiting checks must be rate limited");
    f.importer.status = "ready";
    f.due();
    await f.tick();
    assert.equal(f.importer.submissions.length, 1);
    assert.equal((await f.student()).installedKey.id, uploaded.latestKey.id);
  });
}

test("disabling cancels waiting candidates and reenabling or reuploading the same key does not revive them", async (t) => {
  const f = await fixture(t);
  f.importer.status = "missing";
  await f.setEnabled(true);
  const uploaded = await f.upload();
  await f.tick();
  assert.equal((await f.student()).autoImport.status, "waiting");
  await f.setEnabled(false);
  assert.equal((await f.student()).autoImport.status, "cancelled");
  f.importer.status = "ready";
  f.due();
  await f.tick();
  await f.setEnabled(true);
  await f.upload(uploaded.latestKey.publicKey);
  f.due();
  await f.tick();
  assert.equal(f.importer.submissions.length, 0);
  const fresh = await f.upload();
  await f.tick();
  assert.equal(f.importer.submissions.length, 1);
  assert.equal((await f.student()).installedKey.id, fresh.latestKey.id);
});

test("disabling does not cancel an already approved automatic batch", async (t) => {
  const f = await fixture(t);
  f.importer.submitOverride = async (result) => {
    result.status = "running";
    for (const item of result.items) item.status = "running";
  };
  await f.setEnabled(true);
  const uploaded = await f.upload();
  await f.tick();
  assert.equal(f.importer.submissions.length, 1);
  assert.equal((await f.student()).autoImport.status, "queued");
  await f.setEnabled(false);
  const remote = [...f.importer.jobs.values()][0];
  remote.status = "completed";
  for (const item of remote.items) item.status = "success";
  await f.app.synchronize();
  const view = await f.student();
  assert.equal(view.installedKey.id, uploaded.latestKey.id);
  assert.equal(view.autoImport.status, null);
});

for (const mutation of ["remove", "target"]) {
  test("a waiting candidate is invalidated by student " + mutation + " changes", async (t) => {
    const f = await fixture(t);
    f.importer.status = "missing";
    await f.setEnabled(true);
    await f.upload();
    await f.tick();
    if (mutation === "remove") await f.removeStudent();
    else await f.changeTarget("132");
    f.importer.status = "ready";
    f.due();
    await f.tick();
    assert.equal(f.importer.submissions.length, 0);
    const candidate = f.db.prepare(
      "SELECT status FROM auto_import_candidates WHERE student_id=?",
    ).get(sid);
    assert.ok(!candidate || candidate.status === "cancelled");
    if (mutation === "target") {
      const fresh = await f.upload();
      await f.tick();
      assert.equal(f.importer.submissions[0].items[0].serverId, "132");
      assert.equal((await f.student()).installedKey.id, fresh.latestKey.id);
    }
  });
}

for (const mutation of ["replacement", "disable", "remove", "target"]) {
  test("account-check completion revalidates " + mutation + " changes before approving an automatic import", async (t) => {
    const f = await fixture(t);
    const entered = deferred();
    const release = deferred();
    let firstCheck = true;
    f.importer.checkOverride = async (targets) => {
      if (firstCheck) {
        firstCheck = false;
        entered.resolve();
        await release.promise;
      }
      return targets.map((target) => ({ ...target, status: "ready", message: null }));
    };
    t.after(() => release.resolve());
    await f.setEnabled(true);
    const original = await f.upload();
    const running = f.app.processAutoImports();
    await entered.promise;
    let replacement;
    try {
      if (mutation === "replacement") replacement = await f.upload();
      if (mutation === "disable") await f.setEnabled(false);
      if (mutation === "remove") await f.removeStudent();
      if (mutation === "target") await f.changeTarget("132");
    } finally {
      release.resolve();
    }
    await running;
    await f.app.synchronize();
    assert.ok(
      f.importer.submissions.every((batch) => batch.items.every(
        (item) => item.publicKey !== original.latestKey.publicKey,
      )),
      "the upload checked before the concurrent change must not be approved",
    );
    if (mutation === "replacement") {
      f.due();
      await f.tick();
      assert.equal((await f.student()).installedKey.id, replacement.latestKey.id);
      assert.equal(f.importer.submissions.length, 1);
    } else {
      assert.equal(f.importer.submissions.length, 0);
    }
  });
}

for (const recovery of ["install", "restore"]) {
  test("manual revocation blocks later automatic uploads until a successful manual " + recovery + ", without reviving old candidates", async (t) => {
    const f = await fixture(t);
    await f.setEnabled(true);
    const initial = await f.upload();
    await f.tick();
    await f.approve("revoke");
    let view = await f.student();
    assert.equal(view.installedKey, null);
    assert.equal(view.autoImportBlocked, true);
    const replacement = await f.upload();
    await f.tick();
    view = await f.student();
    assert.equal(view.autoImport.status, "blocked");
    assert.equal(f.importer.submissions.length, 2);
    await f.approve(recovery, [sid],
      recovery === "restore" ? initial.latestKey.id : undefined);
    view = await f.student();
    assert.equal(view.autoImportBlocked, false);
    assert.equal(view.installedKey.id,
      recovery === "restore" ? initial.latestKey.id : replacement.latestKey.id);
    assert.equal(view.autoImport.status, null);
    await f.tick();
    assert.equal(f.importer.submissions.length, 3, "manual recovery must not revive old candidates");
    const newest = await f.upload();
    await f.tick();
    assert.equal((await f.student()).installedKey.id, newest.latestKey.id);
    assert.equal(f.importer.submissions.length, 4);
  });
}

test("completed members of an older mixed batch cannot overwrite a newer installed key during later polls", async (t) => {
  const f = await fixture(t);
  const first = await f.upload();
  await f.upload(edKey().key, secondId);
  let firstBatch = true;
  f.importer.submitOverride = async (result) => {
    if (firstBatch) {
      firstBatch = false;
      result.status = "running";
      result.items.find((item) => item.studentId === secondId).status = "running";
    }
  };
  const oldBatch = await f.approve("install", [sid, secondId]);
  assert.equal(oldBatch.source, "manual");
  assert.equal((await f.student()).installedKey.id, first.latestKey.id);
  await f.setEnabled(true);
  const replacement = await f.upload();
  await f.tick();
  assert.equal((await f.student()).installedKey.id, replacement.latestKey.id);
  for (let i = 0; i < 3; i++) await f.app.synchronize();
  assert.equal((await f.student()).installedKey.id, replacement.latestKey.id);
  const oldRemote = [...f.importer.jobs.values()][0];
  oldRemote.items.find((item) => item.studentId === secondId).status = "success";
  oldRemote.status = "completed";
  await f.app.synchronize();
  assert.equal((await f.student()).installedKey.id, replacement.latestKey.id);
  assert.equal(f.importer.submissions.length, 2);
});


const WEB_SCHEMA_V2 = [
  "CREATE TABLE students(student_id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,username TEXT NOT NULL,server_id TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,latest_key_id TEXT,installed_key_id TEXT,account_status TEXT NOT NULL DEFAULT 'unchecked',account_message TEXT,import_status TEXT NOT NULL DEFAULT 'not_submitted',last_error TEXT,submitted_at TEXT,removed_at TEXT,removed_by TEXT)",
  "CREATE TABLE keys(id TEXT PRIMARY KEY,student_id TEXT NOT NULL REFERENCES students(student_id),version INTEGER NOT NULL,public_key TEXT NOT NULL,fingerprint TEXT NOT NULL,algorithm TEXT NOT NULL,bits INTEGER NOT NULL,created_at TEXT NOT NULL,UNIQUE(student_id,version))",
  "CREATE TABLE challenges(id TEXT PRIMARY KEY,role TEXT NOT NULL,student_id TEXT,email TEXT,code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,consumed INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,role TEXT NOT NULL,student_id TEXT,email TEXT NOT NULL,csrf TEXT NOT NULL,verified_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)",
  "CREATE TABLE rates(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL)",
  "CREATE TABLE previews(id TEXT PRIMARY KEY,kind TEXT NOT NULL,admin_email TEXT NOT NULL,payload TEXT NOT NULL,expires_at INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE batches(id TEXT PRIMARY KEY,request_id TEXT UNIQUE NOT NULL,preview_id TEXT NOT NULL UNIQUE,admin_email TEXT NOT NULL,created_at TEXT NOT NULL,remote_id TEXT,dispatch_error TEXT,dispatched INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE batch_items(id INTEGER PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES batches(id),student_id TEXT NOT NULL REFERENCES students(student_id),server_id TEXT NOT NULL,username TEXT NOT NULL,key_id TEXT,action TEXT NOT NULL,revision INTEGER NOT NULL,fingerprint TEXT,public_key TEXT,status TEXT NOT NULL DEFAULT 'queued',error TEXT,generation INTEGER)",
  "CREATE TABLE audit(id INTEGER PRIMARY KEY,created_at TEXT NOT NULL,actor TEXT NOT NULL,event TEXT NOT NULL,student_id TEXT,detail TEXT)",
  "CREATE INDEX keys_fingerprint ON keys(fingerprint)",
  "CREATE INDEX batch_items_student ON batch_items(student_id,id)",
  "PRAGMA user_version=2",
].join(";\n") + ";";

test("web v2 migration preserves installed and revoked history, restores manual-revocation protection, and keeps automatic import disabled", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "course-keys-auto-migration-"));
  const filename = path.join(directory, "web.sqlite3");
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("course-keys-auto-migration-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const previous = new Database(filename);
  previous.exec(WEB_SCHEMA_V2);
  const scenarios = [
    { studentId: sid, actions: ["install"], installed: true, blocked: 0 },
    { studentId: secondId, actions: ["install", "revoke"], installed: false, blocked: 1 },
    { studentId: "0012345680", actions: ["install", "revoke", "install"], installed: true, blocked: 0 },
    { studentId: "0012345681", actions: ["install", "revoke"], installed: true, blocked: 1, pending: true },
  ];
  for (const scenario of scenarios) {
    const keyId = "legacy-key-" + scenario.studentId;
    previous.prepare(
      "INSERT INTO students(student_id,name,email,username,server_id,latest_key_id,installed_key_id,import_status) VALUES(?,?,?,?,?,?,?,?)",
    ).run(
      scenario.studentId, "历史学生", scenario.studentId + "@stu.pku.edu.cn",
      "stu" + scenario.studentId, "190", keyId, scenario.installed ? keyId : null,
      scenario.pending ? "queued" : scenario.installed ? "installed" : "revoked",
    );
    previous.prepare(
      "INSERT INTO keys(id,student_id,version,public_key,fingerprint,algorithm,bits,created_at) VALUES(?,?,1,?,?,'ed25519',256,?)",
    ).run(keyId, scenario.studentId, edKey().key, "legacy-fingerprint-" + scenario.studentId, "2026-09-01T00:00:00.000Z");
    for (const [index, action] of scenario.actions.entries()) {
      const batchId = "legacy-" + scenario.studentId + "-" + index;
      const status = scenario.pending && action === "revoke" ? "queued" : "success";
      previous.prepare(
        "INSERT INTO batches(id,request_id,preview_id,admin_email,created_at,dispatched) VALUES(?,?,?,?,?,1)",
      ).run(batchId, batchId, batchId, adminEmail, "2026-09-01T00:00:00.000Z");
      previous.prepare(
        "INSERT INTO batch_items(batch_id,student_id,server_id,username,key_id,action,revision,status,generation) VALUES(?,?,'190',?,?,?,?,?,?)",
      ).run(batchId, scenario.studentId, "stu" + scenario.studentId, keyId, action, index + 1, status, index + 1);
    }
  }
  const originalStudents = previous.prepare("SELECT * FROM students ORDER BY student_id").all();
  const originalKeys = previous.prepare("SELECT * FROM keys ORDER BY id").all();
  const originalItems = previous.prepare("SELECT * FROM batch_items ORDER BY id").all();
  previous.close();
  const migrated = openDatabase(filename);
  try {
    assert.equal(migrated.pragma("user_version", { simple: true }), 3);
    assert.equal(migrated.prepare("SELECT enabled FROM auto_import_settings WHERE id=1").get().enabled, 0);
    assert.equal(migrated.prepare("SELECT count(*) AS n FROM auto_import_candidates").get().n, 0);
    assert.deepEqual(migrated.prepare("SELECT * FROM keys ORDER BY id").all(), originalKeys);
    assert.deepEqual(migrated.prepare("SELECT * FROM batch_items ORDER BY id").all(), originalItems);
    assert.deepEqual(
      migrated.prepare("SELECT * FROM students ORDER BY student_id").all()
        .map(({ auto_import_blocked, ...student }) => student),
      originalStudents,
    );
    for (const scenario of scenarios) {
      const row = migrated.prepare("SELECT * FROM students WHERE student_id=?").get(scenario.studentId);
      assert.equal(row.auto_import_blocked, scenario.blocked);
      assert.equal(row.installed_key_id, scenario.installed ? "legacy-key-" + scenario.studentId : null);
    }
    assert.ok(migrated.prepare("SELECT source FROM batches").all().every((batch) => batch.source === "manual"));
  } finally {
    migrated.close();
  }
  const worker = openDatabase(":memory:", true);
  try {
    assert.equal(worker.pragma("user_version", { simple: true }), 2);
    assert.equal(worker.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='auto_import_settings'").get().n, 0);
  } finally {
    worker.close();
  }
});

test("automatic import settings and waiting candidates survive a web restart without another upload", async (t) => {
  const db = openDatabase(":memory:");
  const importer = importerMock();
  importer.status = "missing";
  const first = await fixture(t, { db, importer });
  const setting = await first.setEnabled(true);
  const admin = await first.login();
  const uploaded = await first.upload();
  await first.tick();
  assert.equal((await first.student()).autoImport.status, "waiting");
  await first.app.close();
  const restarted = await fixture(t, { db, importer });
  t.after(() => db.close());
  const settingsResponse = await restarted.request("GET", "/admin/auto-import", null, admin);
  assert.equal(settingsResponse.statusCode, 200, settingsResponse.body);
  assert.deepEqual(settingsResponse.json(), setting);
  importer.status = "ready";
  restarted.due();
  await restarted.tick();
  assert.equal(importer.submissions.length, 1);
  assert.equal(
    db.prepare("SELECT installed_key_id FROM students WHERE student_id=?").get(sid).installed_key_id,
    uploaded.latestKey.id,
  );
});


test("failed automatic installation stays blocked and does not create repeated importer generations", async (t) => {
  const f = await fixture(t);
  f.importer.submitOverride = async (result) => {
    result.status = "failed";
    for (const item of result.items) {
      item.status = "failed";
      item.error = "模拟执行失败，必须人工核验";
    }
  };
  await f.setEnabled(true);
  await f.upload();
  await f.tick();
  let view = await f.student();
  assert.equal(view.installedKey, null);
  assert.equal(view.autoImport.status, "blocked");
  for (let i = 0; i < 3; i++) {
    f.due();
    await f.tick();
  }
  assert.equal(f.importer.submissions.length, 1);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM batches").get().n, 1);
  await f.upload();
  await f.tick();
  view = await f.student();
  assert.equal(view.autoImport.status, "blocked", "new uploads do not bypass an uncertain deployment");
  assert.equal(f.importer.submissions.length, 1);
});

test("an account check for another target cannot approve automatic installation", async (t) => {
  const f = await fixture(t);
  f.importer.checkOverride = async (targets) => targets.map((target) => ({
    ...target, serverId: "132", status: "ready", message: null,
  }));
  await f.setEnabled(true);
  await f.upload();
  await f.tick();
  assert.equal(f.importer.submissions.length, 0);
  assert.equal((await f.student()).autoImport.status, "waiting");
});

test("leaving the enrollment pilot during an account check cancels the pending automatic import", async (t) => {
  const f = await fixture(t, {
    config: { enrollmentOpen: false, enrollmentPilotIds: [sid] },
  });
  const entered = deferred();
  const release = deferred();
  f.importer.checkOverride = async (targets) => {
    entered.resolve();
    await release.promise;
    return targets.map((target) => ({ ...target, status: "ready", message: null }));
  };
  t.after(() => release.resolve());
  await f.setEnabled(true);
  await f.upload();
  const running = f.app.processAutoImports();
  await entered.promise;
  f.config.enrollmentPilotIds = [];
  release.resolve();
  await running;
  await f.app.synchronize();
  assert.equal(f.importer.submissions.length, 0);
  assert.equal(
    f.db.prepare("SELECT status FROM auto_import_candidates WHERE student_id=?").get(sid).status,
    "cancelled",
  );
});

test("a concurrent manual revocation blocks the automatic candidate whose account check was already running", async (t) => {
  const f = await fixture(t);
  await f.setEnabled(true);
  await f.upload();
  await f.tick();
  const entered = deferred();
  const release = deferred();
  let waiting = true;
  f.importer.checkOverride = async (targets) => {
    if (waiting) {
      waiting = false;
      entered.resolve();
      await release.promise;
    }
    return targets.map((target) => ({ ...target, status: "ready", message: null }));
  };
  t.after(() => release.resolve());
  await f.upload();
  const running = f.app.processAutoImports();
  await entered.promise;
  try {
    await f.approve("revoke");
  } finally {
    release.resolve();
  }
  await running;
  await f.app.synchronize();
  const view = await f.student();
  assert.equal(view.installedKey, null);
  assert.equal(view.autoImportBlocked, true);
  assert.equal(view.autoImport.status, "blocked");
  assert.equal(f.importer.submissions.length, 2);
  assert.equal(f.importer.submissions[1].items[0].action, "revoke");
});

test("a stalled server account check does not block another server's automatic import", async (t) => {
  const f = await fixture(t);
  f.db.prepare("UPDATE students SET server_id='132' WHERE student_id=?").run(secondId);
  f.importer.status = "missing";
  await f.setEnabled(true);
  await f.upload();
  await f.tick();
  const second = await f.upload(edKey().key, secondId);
  await f.tick();
  f.due();

  const entered = deferred();
  const release = deferred();
  const fastCompleted = deferred();
  f.importer.checkOverride = async (targets) => {
    if (targets[0].serverId === "190") {
      entered.resolve();
      await release.promise;
    }
    return targets.map((target) => ({ ...target, status: "ready", message: null }));
  };
  f.importer.submitOverride = async (result) => {
    if (result.items.some((item) => item.serverId === "132")) fastCompleted.resolve();
  };
  t.after(() => release.resolve());
  const running = f.app.processAutoImports();
  await entered.promise;
  let timeout;
  try {
    await Promise.race([
      fastCompleted.promise,
      new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("server 132 import was blocked by server 190")), 3000);
      }),
    ]);
    await f.app.synchronize();
    assert.equal(
      f.db.prepare("SELECT installed_key_id FROM students WHERE student_id=?").get(secondId).installed_key_id,
      second.latestKey.id,
    );
    assert.equal(f.importer.submissions.length, 1);
  } finally {
    clearTimeout(timeout);
    release.resolve();
  }
  await running;
  await f.app.synchronize();
  assert.equal(f.importer.submissions.length, 2);
});
