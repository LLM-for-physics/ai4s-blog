import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { edKey, multipart } from "./helpers.js";

const origin = "http://localhost";
const prefix = "/api/course-keys";
const pilot = "0012345678";
const other = "0012345679";
const removed = "0012345680";
const absent = "0012345681";
const adminEmail = "pilot-admin@example.test";

function request(app, method, route, body, auth, file) {
  return app.inject({
    method,
    url: prefix + route,
    headers: {
      origin,
      ...(auth ? { cookie: auth.cookie, "x-csrf-token": auth.csrfToken } : {}),
      ...(file ? { "content-type": file.type } : {}),
    },
    payload: file ? file.body : body,
  });
}

function fixture(t, dbPath = ":memory:") {
  const apps = new Set();
  const mail = [];
  let submissions = 0;
  let polls = 0;
  t.after(async () => {
    for (const app of apps) await app.close();
  });
  return {
    mail,
    async open(enrollmentOpen, pilotIds = []) {
      const app = await createApp({
        config: {
          ...loadConfig({
            NODE_ENV: "test",
            COURSE_KEYS_DB: dbPath,
            COURSE_KEYS_ORIGIN: origin,
            COURSE_KEYS_ADMIN_EMAILS: adminEmail,
            COURSE_KEYS_SECRET:
              "pilot-enrollment-test-secret-not-for-deployment-1234567890",
            COURSE_KEYS_ENROLLMENT_OPEN: String(enrollmentOpen),
            COURSE_KEYS_ENROLLMENT_PILOT_IDS: pilotIds.join(","),
          }),
          pollMs: 60_000,
          otpResendMs: 1,
        },
        mailer: {
          configured: true,
          async sendCode(message) {
            mail.push(message);
          },
        },
        importer: {
          async check(targets) {
            return targets.map((target) => ({
              ...target,
              status: "ready",
              message: null,
            }));
          },
          async submit() {
            submissions++;
            throw new Error("Enrollment and upload must not install keys");
          },
          async get() {
            polls++;
            throw new Error("Enrollment must not create an import to poll");
          },
        },
      });
      apps.add(app);
      await app.ready();
      return app;
    },
    async close(app) {
      await app.close();
      apps.delete(app);
    },
    async challenge(app, identity, role = "student") {
      // Allow another simulated OTP without the production resend cooldown.
      await delay(2);
      const before = mail.length;
      const response = await request(
        app, "POST", "/auth/request-code",
        role === "student"
          ? { role, studentId: identity }
          : { role, email: identity },
      );
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(mail.length, before + 1, "eligible identity receives simulated mail");
      assert.equal(
        mail.at(-1).to,
        role === "student" ? identity + "@stu.pku.edu.cn" : identity,
      );
      return { challengeId: response.json().challengeId, code: mail.at(-1).code };
    },
    async deniedChallenge(app, studentId) {
      const before = mail.length;
      const response = await request(app, "POST", "/auth/request-code", {
        role: "student",
        studentId,
      });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(mail.length, before, "ineligible identity must not receive mail");
      assert.equal(
        app.db.prepare("SELECT email FROM challenges WHERE id=?")
          .get(response.json().challengeId).email,
        null,
      );
    },
    assertNoInstallation(app) {
      assert.equal(submissions, 0, "uploads never submit import jobs");
      assert.equal(polls, 0, "there are no import jobs to poll");
      assert.equal(app.db.prepare("SELECT count(*) AS n FROM batches").get().n, 0);
      assert.equal(app.db.prepare("SELECT count(*) AS n FROM batch_items").get().n, 0);
      assert.equal(
        app.db.prepare(
          "SELECT count(*) AS n FROM students WHERE installed_key_id IS NOT NULL",
        ).get().n,
        0,
      );
    },
  };
}

function seed(app, ids) {
  const insert = app.db.prepare(
    "INSERT INTO students(student_id,name,email,username,server_id) VALUES(?,?,?,?,?)",
  );
  for (const id of ids)
    insert.run(id, "模拟学生", id + "@stu.pku.edu.cn", "stu" + id, "190");
}

async function verify(app, challenge) {
  const response = await request(app, "POST", "/auth/verify", challenge);
  assert.equal(response.statusCode, 200, response.body);
  return {
    cookie: response.headers["set-cookie"].split(";")[0],
    csrfToken: response.json().csrfToken,
  };
}

async function assertRejectedCode(app, challenge) {
  const response = await request(app, "POST", "/auth/verify", challenge);
  assert.equal(response.statusCode, 401, response.body);
  assert.equal(response.json().error.code, "INVALID_CODE");
  assert.equal(
    app.db.prepare("SELECT consumed FROM challenges WHERE id=?")
      .get(challenge.challengeId).consumed,
    0,
  );
}

async function assertBlockedSession(app, auth, code = "ENROLLMENT_CLOSED") {
  const expectedStatus = code === "UNAUTHENTICATED" ? 401 : 403;
  for (const [method, route, file] of [
    ["GET", "/me"],
    ["POST", "/me/key", multipart("key.pub", edKey().key)],
  ]) {
    const response = await request(app, method, route, undefined, auth, file);
    assert.equal(response.statusCode, expectedStatus, response.body);
    assert.equal(response.json().error.code, code);
  }
  const session = await request(app, "GET", "/auth/session", undefined, auth);
  assert.equal(session.statusCode, 200, session.body);
  assert.equal(session.json().user, null);
}

async function assertHealth(app, mode) {
  const response = await request(app, "GET", "/health");
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().enrollmentMode, mode);
  assert.equal(response.json().enrollmentOpen, mode !== "closed");
  assert.equal(Object.hasOwn(response.json(), "enrollmentPilotIds"), false);
  for (const id of [pilot, other, removed, absent])
    assert.equal(response.body.includes(id), false, "health must not publish pilot IDs");
}

test("pilot configuration preserves numeric text and fails closed on malformed lists", () => {
  const read = (value) => loadConfig({
    NODE_ENV: "test",
    ...(value === undefined ? {} : { COURSE_KEYS_ENROLLMENT_PILOT_IDS: value }),
  });
  assert.deepEqual(read().enrollmentPilotIds, []);
  assert.deepEqual(read("").enrollmentPilotIds, []);
  assert.deepEqual(read(" \t ").enrollmentPilotIds, []);
  assert.deepEqual(
    read(" 0012345678,123456,0012345678,0000000000000001 ").enrollmentPilotIds,
    ["0012345678", "123456", "0000000000000001"],
  );
  assert.deepEqual(
    read("00123456,123456").enrollmentPilotIds,
    ["00123456", "123456"],
  );
  for (const invalid of [
    "*", "all", "12345", "12345678901234567", "+123456", "-123456",
    "1234.56", "1234e6", "１２３４５６", "123 456", "123456;234567",
    ",123456", "123456,", "123456,,234567", "123456, ,234567",
    "123456,*", "123456,invalid",
  ]) {
    assert.throws(
      () => read(invalid), undefined, "must reject " + JSON.stringify(invalid),
    );
    assert.throws(
      () => loadConfig({
        NODE_ENV: "test",
        COURSE_KEYS_ENROLLMENT_OPEN: "true",
        COURSE_KEYS_ENROLLMENT_PILOT_IDS: invalid,
      }),
      undefined,
      "global enrollment must not hide invalid pilot configuration",
    );
  }
});

test("health reports effective enrollment mode without revealing pilot identities", async (t) => {
  const f = fixture(t);
  for (const [open, ids, mode] of [
    [false, [], "closed"],
    [false, [pilot], "pilot"],
    [true, [], "open"],
    [true, [pilot], "open"],
  ]) {
    const app = await f.open(open, ids);
    await assertHealth(app, mode);
    await f.close(app);
  }
});

test("only enrolled pilot students receive codes and upload; pilot membership does not bypass roster removal", async (t) => {
  const f = fixture(t);
  const app = await f.open(false, [pilot, removed, absent]);
  seed(app, [pilot, other, removed]);
  app.db.prepare("UPDATE students SET removed_at=? WHERE student_id=?")
    .run(new Date().toISOString(), removed);
  const auth = await verify(app, await f.challenge(app, pilot));
  const me = await request(app, "GET", "/me", undefined, auth);
  assert.equal(me.statusCode, 200, me.body);
  assert.equal(me.json().student.studentId, pilot);
  const key = edKey().key;
  const upload = await request(
    app, "POST", "/me/key", undefined, auth, multipart("pilot.pub", key),
  );
  assert.equal(upload.statusCode, 200, upload.body);
  assert.equal(upload.json().student.latestKey.publicKey, key);
  assert.equal(upload.json().student.importStatus, "pending_review");
  for (const id of [other, removed, absent]) await f.deniedChallenge(app, id);

  const pending = await f.challenge(app, pilot);
  app.db.prepare("UPDATE students SET removed_at=? WHERE student_id=?")
    .run(new Date().toISOString(), pilot);
  await assertBlockedSession(app, auth, "UNAUTHENTICATED");
  await assertRejectedCode(app, pending);
  assert.equal(app.db.prepare("SELECT count(*) AS n FROM keys").get().n, 1);

  const admin = await verify(app, await f.challenge(app, adminEmail, "admin"));
  const roster = await request(app, "GET", "/admin/students", undefined, admin);
  assert.equal(roster.statusCode, 200, roster.body);
  f.assertNoInstallation(app);
});

test("restarts enforce pilot changes for existing sessions and unused OTPs, while global opening admits all enrolled students", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "course-keys-pilot-"));
  const f = fixture(t, path.join(directory, "web.sqlite3"));
  // App cleanup is registered first so Windows releases SQLite file locks.
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("course-keys-pilot-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const opened = await f.open(true, [pilot]);
  seed(opened, [pilot, other]);
  await assertHealth(opened, "open");
  const otherAuth = await verify(opened, await f.challenge(opened, other));
  const otherPending = await f.challenge(opened, other);
  assert.equal(
    (await request(opened, "GET", "/me", undefined, otherAuth)).statusCode,
    200,
  );
  await f.close(opened);

  const limited = await f.open(false, [pilot]);
  await assertHealth(limited, "pilot");
  await assertBlockedSession(limited, otherAuth);
  await assertRejectedCode(limited, otherPending);
  const pilotAuth = await verify(limited, await f.challenge(limited, pilot));
  const pilotPending = await f.challenge(limited, pilot);
  const upload = await request(
    limited, "POST", "/me/key", undefined, pilotAuth,
    multipart("pilot.pub", edKey().key),
  );
  assert.equal(upload.statusCode, 200, upload.body);
  const admin = await verify(
    limited, await f.challenge(limited, adminEmail, "admin"),
  );
  f.assertNoInstallation(limited);
  await f.close(limited);

  const changed = await f.open(false, [other]);
  await assertHealth(changed, "pilot");
  await assertBlockedSession(changed, pilotAuth);
  await assertRejectedCode(changed, pilotPending);
  const restoredOther = await request(
    changed, "GET", "/me", undefined, otherAuth,
  );
  assert.equal(restoredOther.statusCode, 200, restoredOther.body);
  await f.close(changed);

  const closed = await f.open(false, []);
  await assertHealth(closed, "closed");
  await assertBlockedSession(closed, otherAuth);
  await assertBlockedSession(closed, pilotAuth);
  await assertRejectedCode(closed, otherPending);
  await assertRejectedCode(closed, pilotPending);
  const adminRoster = await request(
    closed, "GET", "/admin/students", undefined, admin,
  );
  assert.equal(adminRoster.statusCode, 200, adminRoster.body);
  assert.equal(closed.db.prepare("SELECT count(*) AS n FROM keys").get().n, 1);
  f.assertNoInstallation(closed);
  await f.close(closed);

  const reopened = await f.open(true, []);
  await assertHealth(reopened, "open");
  const otherFromPending = await verify(reopened, otherPending);
  const pilotFromPending = await verify(reopened, pilotPending);
  for (const auth of [otherAuth, pilotAuth, otherFromPending, pilotFromPending]) {
    const me = await request(reopened, "GET", "/me", undefined, auth);
    assert.equal(me.statusCode, 200, me.body);
  }
  f.assertNoInstallation(reopened);
});
