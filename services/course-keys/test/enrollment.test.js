import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { edKey, multipart } from "./helpers.js";

const origin = "http://localhost";
const prefix = "/api/course-keys";
const firstStudent = "0012345678";
const secondStudent = "0012345679";
const adminEmail = "enrollment-admin@example.test";

test("closing enrollment blocks persisted student sessions and unconsumed codes across restart; reopening restores unexpired credentials", async (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "course-keys-enrollment-"),
  );
  const filename = path.join(directory, "web.sqlite3");
  const apps = [];
  const inbox = new Map();
  let imports = 0;
  t.after(async () => {
    for (const app of apps) await app.close();
    assert.equal(
      path.dirname(path.resolve(directory)),
      path.resolve(os.tmpdir()),
    );
    assert.ok(path.basename(directory).startsWith("course-keys-enrollment-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const baseConfig = loadConfig({
    NODE_ENV: "test",
    COURSE_KEYS_DB: filename,
    COURSE_KEYS_ORIGIN: origin,
    COURSE_KEYS_ADMIN_EMAILS: adminEmail,
    COURSE_KEYS_SECRET:
      "enrollment-restart-test-secret-not-for-deployment-1234567890",
  });
  async function open(enrollmentOpen) {
    const app = await createApp({
      config: { ...baseConfig, enrollmentOpen, pollMs: 60_000 },
      mailer: {
        configured: true,
        async sendCode(mail) {
          inbox.set(mail.to, mail);
        },
      },
      importer: {
        async check(ids) {
          return ids.map((target) => ({
            ...target,
            status: "ready",
            message: null,
          }));
        },
        async submit() {
          imports++;
          throw new Error("This test must never approve an import");
        },
        async get() {
          throw new Error("This test must never poll an import");
        },
      },
    });
    apps.push(app);
    await app.ready();
    return app;
  }
  function request(
    app,
    method,
    route,
    body = undefined,
    auth = null,
    file = null,
  ) {
    return app.inject({
      method,
      url: prefix + route,
      headers: {
        origin,
        ...(auth
          ? { cookie: auth.cookie, "x-csrf-token": auth.csrfToken }
          : {}),
        ...(file ? { "content-type": file.type } : {}),
      },
      payload: file ? file.body : body,
    });
  }
  async function challenge(app, role, identity) {
    const email = role === "student" ? identity + "@stu.pku.edu.cn" : identity;
    const response = await request(
      app,
      "POST",
      "/auth/request-code",
      role === "student" ? { role, studentId: identity } : { role, email },
    );
    assert.equal(response.statusCode, 200, response.body);
    const mail = inbox.get(email);
    assert.ok(mail, "an authorized identity must receive a simulated code");
    return { challengeId: response.json().challengeId, code: mail.code };
  }
  async function verify(app, payload) {
    const response = await request(app, "POST", "/auth/verify", payload);
    assert.equal(response.statusCode, 200, response.body);
    return {
      cookie: response.headers["set-cookie"].split(";")[0],
      csrfToken: response.json().csrfToken,
    };
  }

  const opened = await open(true);
  for (const [studentId, name] of [
    [firstStudent, "第一个模拟学生"],
    [secondStudent, "第二个模拟学生"],
  ]) {
    opened.db
      .prepare(
        "INSERT INTO students(student_id,name,email,username,server_id) VALUES(?,?,?,?,?)",
      )
      .run(
        studentId,
        name,
        studentId + "@stu.pku.edu.cn",
        "stu" + studentId,
        "190",
      );
  }
  const firstSession = await verify(
    opened,
    await challenge(opened, "student", firstStudent),
  );
  const pendingCode = await challenge(opened, "student", secondStudent);
  assert.equal(
    (await request(opened, "GET", "/me", undefined, firstSession)).statusCode,
    200,
  );
  await opened.close();

  const closed = await open(false);
  const meWhileClosed = await request(
    closed,
    "GET",
    "/me",
    undefined,
    firstSession,
  );
  assert.equal(meWhileClosed.statusCode, 403, meWhileClosed.body);
  assert.equal(meWhileClosed.json().error.code, "ENROLLMENT_CLOSED");
  const key = edKey().key;
  const uploadWhileClosed = await request(
    closed,
    "POST",
    "/me/key",
    undefined,
    firstSession,
    multipart("key.pub", key),
  );
  assert.equal(uploadWhileClosed.statusCode, 403, uploadWhileClosed.body);
  assert.equal(uploadWhileClosed.json().error.code, "ENROLLMENT_CLOSED");
  assert.equal(closed.db.prepare("SELECT count(*) AS n FROM keys").get().n, 0);
  const verifyWhileClosed = await request(
    closed,
    "POST",
    "/auth/verify",
    pendingCode,
  );
  assert.equal(verifyWhileClosed.statusCode, 401, verifyWhileClosed.body);
  assert.equal(verifyWhileClosed.json().error.code, "INVALID_CODE");
  assert.equal(
    closed.db
      .prepare("SELECT consumed FROM challenges WHERE id=?")
      .get(pendingCode.challengeId).consumed,
    0,
  );
  const adminSession = await verify(
    closed,
    await challenge(closed, "admin", adminEmail),
  );
  const adminStudents = await request(
    closed,
    "GET",
    "/admin/students",
    undefined,
    adminSession,
  );
  assert.equal(adminStudents.statusCode, 200, adminStudents.body);
  assert.equal(adminStudents.json().stats.total, 2);
  await closed.close();

  const reopened = await open(true);
  const meAfterReopen = await request(
    reopened,
    "GET",
    "/me",
    undefined,
    firstSession,
  );
  assert.equal(meAfterReopen.statusCode, 200, meAfterReopen.body);
  assert.equal(meAfterReopen.json().student.studentId, firstStudent);
  const uploadAfterReopen = await request(
    reopened,
    "POST",
    "/me/key",
    undefined,
    firstSession,
    multipart("key.pub", key),
  );
  assert.equal(uploadAfterReopen.statusCode, 200, uploadAfterReopen.body);
  assert.equal(uploadAfterReopen.json().student.latestKey.publicKey, key);
  const secondSession = await verify(reopened, pendingCode);
  const secondMe = await request(
    reopened,
    "GET",
    "/me",
    undefined,
    secondSession,
  );
  assert.equal(secondMe.statusCode, 200, secondMe.body);
  assert.equal(secondMe.json().student.studentId, secondStudent);
  assert.equal(
    reopened.db
      .prepare("SELECT consumed FROM challenges WHERE id=?")
      .get(pendingCode.challengeId).consumed,
    1,
  );
  assert.equal(
    (await request(reopened, "GET", "/admin/students", undefined, adminSession))
      .statusCode,
    200,
  );
  assert.equal(
    imports,
    0,
    "opening, closing, and uploads must never approve installations",
  );
});
