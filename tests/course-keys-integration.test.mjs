import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createApp } from "../services/course-keys/src/app.js";
import { loadConfig } from "../services/course-keys/src/config.js";

const origin = "http://localhost";
const prefix = "/api/course-keys";
function publicKey() {
  const pair = crypto.generateKeyPairSync("ed25519");
  const raw = Buffer.from(
    pair.publicKey.export({ format: "jwk" }).x,
    "base64url",
  );
  const type = Buffer.from("ssh-ed25519");
  const size = (b) => {
    const n = Buffer.alloc(4);
    n.writeUInt32BE(b.length);
    return Buffer.concat([n, b]);
  };
  return (
    "ssh-ed25519 " + Buffer.concat([size(type), size(raw)]).toString("base64")
  );
}
function multipart(filename, content) {
  const boundary = "coursekey" + crypto.randomBytes(12).toString("hex");
  return {
    body: Buffer.concat([
      Buffer.from(
        "--" +
          boundary +
          '\r\nContent-Disposition: form-data; name="file"; filename="' +
          filename +
          '"\r\nContent-Type: application/octet-stream\r\n\r\n',
      ),
      Buffer.from(content),
      Buffer.from("\r\n--" + boundary + "--\r\n"),
    ]),
    type: "multipart/form-data; boundary=" + boundary,
  };
}
async function fixture(t) {
  const inbox = new Map(),
    accounts = new Map(),
    jobs = new Map();
  const config = loadConfig({
    NODE_ENV: "test",
    COURSE_KEYS_DB: ":memory:",
    COURSE_KEYS_ORIGIN: origin,
    COURSE_KEYS_ENROLLMENT_OPEN: "true",
    COURSE_KEYS_ADMIN_EMAILS: "admin@example.test",
    COURSE_KEYS_SECRET: "test-only-secret-never-deploy-1234567890",
  });
  const importer = {
    async check(targets) {
      return {
        accounts: targets.map((destination) => ({
          ...destination,
          status: accounts.get(destination.studentId) || "missing",
          message: accounts.has(destination.studentId) ? null : "账号不存在，待创建",
        })),
      };
    },
    async submit(payload) {
      if (jobs.has(payload.requestId)) return jobs.get(payload.requestId);
      const job = {
        id: payload.requestId,
        status: "completed",
        createdAt: new Date().toISOString(),
        items: payload.items.map((x) => ({
          ...x,
          status: "success",
          error: null,
          generation: 1,
        })),
      };
      jobs.set(job.id, job);
      return job;
    },
    async get(id) {
      return jobs.get(id);
    },
  };
  const app = await createApp({
    config,
    mailer: {
      configured: true,
      async sendCode(mail) {
        inbox.set(mail.to, mail);
      },
    },
    importer,
  });
  await app.ready();
  t.after(() => app.close());
  async function request(method, url, payload, session, upload) {
    const headers = {
      origin,
      ...(session
        ? {
            cookie: session.cookie,
            ...(session.csrfToken ? { "x-csrf-token": session.csrfToken } : {}),
          }
        : {}),
    };
    if (upload) headers["content-type"] = upload.type;
    return app.inject({
      method,
      url: prefix + url,
      headers,
      payload: upload ? upload.body : payload,
    });
  }
  async function login(role, identity) {
    const email = role === "student" ? identity + "@stu.pku.edu.cn" : identity;
    let r = await request(
      "POST",
      "/auth/request-code",
      role === "student"
        ? { role, studentId: identity }
        : { role, email: identity },
    );
    assert.equal(r.statusCode, 200, r.body);
    const message = inbox.get(email);
    assert.ok(message, "mock mailbox must receive OTP");
    r = await request("POST", "/auth/verify", {
      challengeId: r.json().challengeId,
      code: message.code,
    });
    assert.equal(r.statusCode, 200, r.body);
    const cookie = []
      .concat(r.headers["set-cookie"] || [])
      .map((s) => s.split(";")[0])
      .join("; ");
    r = await request("GET", "/auth/session", undefined, { cookie });
    assert.equal(r.statusCode, 200, r.body);
    return { cookie, csrfToken: r.json().csrfToken };
  }
  async function roster(ids) {
    const admin = await login("admin", "admin@example.test");
    let r = await request(
      "POST",
      "/admin/roster/preview",
      null,
      admin,
      multipart(
        "roster.csv",
        "学号,姓名,服务器号\n" + ids.map((id, i) => id + ",模拟学生" + i + "," + ["132", "190", "197"][i % 3]).join("\n"),
      ),
    );
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json().errors, []);
    r = await request(
      "POST",
      "/admin/roster/commit",
      { previewId: r.json().previewId },
      admin,
    );
    assert.equal(r.statusCode, 200, r.body);
    return admin;
  }
  return { app, config, inbox, accounts, jobs, request, login, roster };
}

test("120 students sharing a classroom IP can authenticate and submit distinct keys without lost records", async (t) => {
  const f = await fixture(t);
  const ids = Array.from({ length: 120 }, (_, i) => String(9000000000 + i));
  const admin = await f.roster(ids);
  const samples = ids.map((studentId) => ({ studentId, key: publicKey() }));
  const started = Date.now();
  for (let i = 0; i < samples.length; i += 12)
    await Promise.all(
      samples.slice(i, i + 12).map(async ({ studentId, key }) => {
        const session = await f.login("student", studentId);
        const r = await f.request(
          "POST",
          "/me/key",
          null,
          session,
          multipart("id_ed25519.pub", key + "\n"),
        );
        assert.equal(r.statusCode, 200, r.body);
        assert.equal(r.json().student.studentId, studentId);
        assert.equal(r.json().student.latestKey.publicKey.trim(), key);
      }),
    );
  const result = await f.request("GET", "/admin/students", undefined, admin);
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.json().stats.total, 120);
  assert.equal(result.json().stats.submitted, 120);
  assert.equal(
    new Set(result.json().students.map((s) => s.latestKey.fingerprint)).size,
    120,
  );
  assert.equal(f.jobs.size, 0, "upload must never install a key");
  for (const serverId of ["132", "190", "197"]) assert.equal(result.json().students.filter((row) => row.serverId === serverId).length, 40);
  t.diagnostic(
    "120 synthetic identities completed in " +
      (Date.now() - started) +
      "ms; no actual mail or SSH was used.",
  );
});

test("a leading-zero student identity with stu username may submit before the account exists, then import without re-upload", async (t) => {
  const f = await fixture(t),
    studentId = "0012345678";
  const admin = await f.roster([studentId]),
    student = await f.login("student", studentId);
  const upload = await f.request(
    "POST",
    "/me/key",
    null,
    student,
    multipart("id_ed25519.pub", publicKey()),
  );
  assert.equal(upload.statusCode, 200, upload.body);
  assert.equal(upload.json().student.email, studentId + "@stu.pku.edu.cn");
  assert.equal(upload.json().student.username, "stu" + studentId);
  const keyId = upload.json().student.latestKey.id;
  let preview = await f.request(
    "POST",
    "/admin/imports/preview",
    { studentIds: [studentId] },
    admin,
  );
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(preview.json().items[0].eligible, false);
  assert.equal(f.jobs.size, 0);
  f.accounts.set(studentId, "ready");
  preview = await f.request(
    "POST",
    "/admin/imports/preview",
    { studentIds: [studentId] },
    admin,
  );
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(preview.json().items[0].eligible, true);
  const requestId = crypto.randomUUID(),
    payload = { previewId: preview.json().previewId, requestId };
  const installed = await f.request("POST", "/admin/imports", payload, admin);
  assert.equal(installed.statusCode, 200, installed.body);
  const repeated = await f.request("POST", "/admin/imports", payload, admin);
  assert.equal(repeated.statusCode, 200, repeated.body);
  assert.equal(repeated.json().id, installed.json().id);
  for (let i = 0; i < 100; i++) {
    const r = await f.request(
      "GET",
      "/admin/imports/" + installed.json().id,
      undefined,
      admin,
    );
    if (r.json().status === "completed") break;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  const me = await f.request("GET", "/me", undefined, student);
  assert.equal(me.json().student.latestKey.id, keyId);
  assert.equal(me.json().student.installedKey.id, keyId);
  assert.equal(f.jobs.size, 1);
});

test("new upload makes an unconfirmed preview stale; incorrect and cross-student keys never replace accepted data", async (t) => {
  const f = await fixture(t),
    ids = ["0012345678", "0012345679"];
  const admin = await f.roster(ids),
    a = await f.login("student", ids[0]),
    b = await f.login("student", ids[1]);
  f.accounts.set(ids[0], "ready");
  const key = publicKey();
  let r = await f.request("POST", "/me/key", null, a, multipart("id.pub", key));
  assert.equal(r.statusCode, 200, r.body);
  const firstId = r.json().student.latestKey.id;
  r = await f.request("POST", "/me/key", null, a, multipart("id.pub", key));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().duplicate, true);
  r = await f.request("POST", "/me/key", null, b, multipart("id.pub", key));
  assert.ok(r.statusCode >= 400 && r.statusCode < 500, r.body);
  r = await f.request(
    "POST",
    "/me/key",
    null,
    a,
    multipart(
      "private.pub",
      "-----BEGIN OPENSSH PRIVATE KEY-----\nnot-a-public-key\n-----END OPENSSH PRIVATE KEY-----",
    ),
  );
  assert.ok(r.statusCode >= 400 && r.statusCode < 500, r.body);
  let me = await f.request("GET", "/me", undefined, a);
  assert.equal(me.json().student.latestKey.id, firstId);
  const preview = await f.request(
    "POST",
    "/admin/imports/preview",
    { studentIds: [ids[0]] },
    admin,
  );
  assert.equal(preview.statusCode, 200, preview.body);
  r = await f.request(
    "POST",
    "/me/key",
    null,
    a,
    multipart("id.pub", publicKey()),
  );
  assert.equal(r.statusCode, 200, r.body);
  r = await f.request(
    "POST",
    "/admin/imports",
    { previewId: preview.json().previewId, requestId: crypto.randomUUID() },
    admin,
  );
  assert.equal(r.statusCode, 409, r.body);
  assert.equal(f.jobs.size, 0);
  const exportReply = await f.request(
    "GET",
    "/admin/students/export",
    undefined,
    admin,
  );
  assert.equal(exportReply.statusCode, 200, exportReply.body);
  assert.equal(exportReply.rawPayload.subarray(0, 2).toString(), "PK");
});

test("the roster template has the three requested columns; malformed bodies and CSRF are client errors", async (t) => {
  const f = await fixture(t),
    admin = await f.login("admin", "admin@example.test");
  const csv = await f.request(
    "GET",
    "/admin/roster/template?format=csv",
    undefined,
    admin,
  );
  assert.equal(csv.statusCode, 200, csv.body);
  assert.equal(csv.body.replace(/^\uFEFF/, "").trim(), "学号,姓名,服务器号");
  let r = await f.app.inject({
    method: "POST",
    url: prefix + "/auth/request-code",
    headers: { origin, "content-type": "application/json" },
    payload: "{",
  });
  assert.equal(r.statusCode, 400, r.body);
  r = await f.request(
    "POST",
    "/admin/students/check",
    { studentIds: ["0012345678"] },
    { cookie: admin.cookie, csrfToken: "界".repeat(admin.csrfToken.length) },
  );
  assert.equal(r.statusCode, 403, r.body);
});

test("OTP resend cooldown is applied to the normalized admin address", async (t) => {
  const f = await fixture(t);
  let r = await f.request("POST", "/auth/request-code", {
    role: "admin",
    email: "admin@example.test",
  });
  assert.equal(r.statusCode, 200, r.body);
  r = await f.request("POST", "/auth/request-code", {
    role: "admin",
    email: " ADMIN@EXAMPLE.TEST ",
  });
  assert.equal(r.statusCode, 429, r.body);
});


test("120 students auto-import across three servers and replace keys without manual batches", async (t) => {
  const f = await fixture(t);
  const ids = Array.from({ length: 120 }, (_, i) => String(9100000000 + i));
  const admin = await f.roster(ids);
  let response = await f.request("GET", "/admin/auto-import", undefined, admin);
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().enabled, false);
  response = await f.request("PUT", "/admin/auto-import", { enabled: true, revision: response.json().revision }, admin);
  assert.equal(response.statusCode, 200, response.body);
  for (const id of ids) f.accounts.set(id, "ready");
  const students = new Map();
  const started = Date.now();
  for (let offset = 0; offset < ids.length; offset += 12) {
    await Promise.all(ids.slice(offset, offset + 12).map(async (id) => {
      const session = await f.login("student", id);
      students.set(id, session);
      const upload = await f.request("POST", "/me/key", null, session, multipart("id.pub", publicKey()));
      assert.equal(upload.statusCode, 200, upload.body);
    }));
  }
  async function settle() {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      await f.app.processAutoImports();
      await f.app.synchronize();
      const remaining = f.app.db.prepare("SELECT count(*) AS n FROM students WHERE latest_key_id IS NOT installed_key_id").get().n;
      if (!remaining) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.fail("Automatic import did not settle for all students");
  }
  await settle();
  assert.equal(f.jobs.size, 120);
  assert.equal(f.app.db.prepare("SELECT count(*) AS n FROM batches WHERE source='automatic'").get().n, 120);
  for (const id of ids.slice(0, 12)) {
    const r = await f.request("POST", "/me/key", null, students.get(id), multipart("replacement.pub", publicKey()));
    assert.equal(r.statusCode, 200, r.body);
  }
  await settle();
  assert.equal(f.jobs.size, 132);
  assert.equal(f.app.db.prepare("SELECT count(*) AS n FROM keys").get().n, 132);
  const result = await f.request("GET", "/admin/students", undefined, admin);
  assert.equal(result.json().stats.installed, 120);
  for (const serverId of ["132", "190", "197"]) {
    assert.equal(result.json().students.filter(row => row.serverId === serverId && row.installedKey?.id === row.latestKey?.id).length, 40);
  }
  await f.app.processAutoImports(); await f.app.synchronize();
  assert.equal(f.jobs.size, 132, "Subsequent polling must not install duplicates");
  t.diagnostic("120 initial automatic imports + 12 replacements completed in " + (Date.now() - started) + "ms with simulated mail and importer; no SMTP or SSH.");
});
