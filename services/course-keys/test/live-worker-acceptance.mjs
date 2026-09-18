/**
 * Explicit live acceptance only; deliberately excluded from *.test.js.
 * Run on the deployment host as course-keys-web:
 *   node test/live-worker-acceptance.mjs --student 0099000190
 * Uses an in-memory web database and fake mail, but the real importer/helper.
 * Never opens a privileged helper, changes accounts/SSH, or reads production DBs.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createImporterClient } from "../src/importer-client.js";
import { publicKey as parsePublicKey } from "../src/security.js";

const TARGET = "0099000190";
const SOCKET = "/run/course-keys-importer/importer.sock";
const DIRECTORY = "/etc/ssh/course_authorized_keys";
const HEADER = "# course-keys ";
const ORIGIN = "http://127.0.0.1";
const PREFIX = "/api/course-keys";
const ADMIN = "live-acceptance-admin@example.invalid";
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  process.stdout.write(
    "Explicit live test: node test/live-worker-acceptance.mjs --student 0099000190\nRun as course-keys-web on the deployment host. Installs only temporary test public keys and leaves the test account revoked. No mail or production web database is used.\n",
  );
  process.exit(0);
}
if (args.length !== 2 || args[0] !== "--student" || args[1] !== TARGET) {
  process.stderr.write(
    "Refused: only explicit --student 0099000190 is permitted.\n",
  );
  process.exit(64);
}
if (
  process.platform !== "linux" ||
  os.userInfo().username !== "course-keys-web" ||
  process.getuid() === 0
) {
  process.stderr.write(
    "Refused: run on Linux as the unprivileged course-keys-web account.\n",
  );
  process.exit(64);
}

function fault(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}
function must(condition, code) {
  if (!condition) fault(code);
}
function errorCode(error) {
  return typeof error?.code === "string" &&
    /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)
    ? error.code
    : "ACCEPTANCE_FAILED";
}
function log(step, state = null, code = null) {
  const record = { step, studentId: TARGET };
  if (state) {
    record.action = state.action;
    record.generation = state.generation;
    record.fingerprint = state.fingerprint;
  }
  if (code) record.code = code;
  process.stdout.write(JSON.stringify(record) + "\n");
}
function readState() {
  for (const directory of ["/", "/etc", "/etc/ssh", DIRECTORY]) {
    const info = fs.lstatSync(directory);
    must(
      info.isDirectory() &&
        !info.isSymbolicLink() &&
        info.uid === 0 &&
        !(info.mode & 0o022),
      "UNSAFE_STATE_DIRECTORY",
    );
  }
  let fd;
  try {
    fd = fs.openSync(
      path.join(DIRECTORY, TARGET),
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
  } catch (error) {
    if (error.code === "ENOENT")
      return { action: "none", generation: 0, fingerprint: null };
    throw error;
  }
  try {
    const info = fs.fstatSync(fd);
    must(
      info.isFile() &&
        info.uid === 0 &&
        !(info.mode & 0o022) &&
        info.nlink === 1 &&
        info.size > 0 &&
        info.size <= 8192,
      "UNSAFE_STATE_FILE",
    );
    const content = fs.readFileSync(fd, "utf8");
    must(content.endsWith("\n"), "INVALID_STATE_FILE");
    const lines = content.slice(0, -1).split("\n");
    must(lines[0].startsWith(HEADER), "UNMANAGED_STATE_FILE");
    let state;
    try {
      state = JSON.parse(lines[0].slice(HEADER.length));
    } catch {
      fault("INVALID_STATE_METADATA");
    }
    must(
      state.schemaVersion === 1 &&
        state.studentId === TARGET &&
        Number.isSafeInteger(state.generation) &&
        state.generation >= 1 &&
        ["install", "revoke"].includes(state.action),
      "INVALID_STATE_METADATA",
    );
    if (state.action === "install") {
      must(lines.length === 2, "INVALID_STATE_KEY");
      const key = parsePublicKey(lines[1]);
      must(
        key.publicKey === lines[1] && key.fingerprint === state.fingerprint,
        "INVALID_STATE_KEY",
      );
    } else
      must(
        lines.length === 1 && state.fingerprint === null,
        "INVALID_REVOKED_STATE",
      );
    return {
      action: state.action,
      generation: state.generation,
      fingerprint: state.fingerprint,
    };
  } finally {
    fs.closeSync(fd);
  }
}
function ephemeralKey() {
  const { publicKey } = crypto.generateKeyPairSync("ed25519");
  const bytes = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
  const parts = [Buffer.from("ssh-ed25519"), bytes].flatMap((part) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(part.length);
    return [length, part];
  });
  return parsePublicKey(
    "ssh-ed25519 " + Buffer.concat(parts).toString("base64"),
  );
}
function upload(filename, content) {
  const boundary = "acceptance" + crypto.randomBytes(12).toString("hex");
  return {
    contentType: "multipart/form-data; boundary=" + boundary,
    body: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      Buffer.from(content),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

let app = null;
let phase = "preflight";
let interrupted = false;
let passed = false;
let safeInitialState = false;
let cleanupSucceeded = false;
let failure = null;
let stateGeneration = 0;
const ownFingerprints = new Set();
const submitted = new Map();
const inbox = new Map();
const config = {
  ...loadConfig({
    NODE_ENV: "test",
    COURSE_KEYS_ORIGIN: ORIGIN,
    COURSE_KEYS_DB: ":memory:",
    COURSE_KEYS_IMPORTER_SOCKET: SOCKET,
    COURSE_KEYS_ADMIN_EMAILS: ADMIN,
    COURSE_KEYS_ENROLLMENT_OPEN: "true",
    COURSE_KEYS_SECRET: crypto.randomBytes(48).toString("hex"),
  }),
  pollMs: 250,
};
const live = createImporterClient(config);
const tracked = {
  check: (ids) => {
    must(ids.length === 1 && ids[0] === TARGET, "UNEXPECTED_ACCOUNT_SELECTION");
    return live.check(ids);
  },
  get: (id) => live.get(id),
  async submit(request) {
    must(
      request.items.length === 1 &&
        request.items[0].studentId === TARGET &&
        ownFingerprints.has(request.items[0].fingerprint),
      "UNEXPECTED_LIVE_REQUEST",
    );
    submitted.set(request.requestId, request);
    return live.submit(request);
  },
};
const stop = () => {
  interrupted = true;
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
function checkpoint() {
  if (interrupted) fault("INTERRUPTED");
}
function safeCurrent() {
  const state = readState();
  must(
    state.action !== "install" || ownFingerprints.has(state.fingerprint),
    "UNKNOWN_CURRENT_KEY",
  );
  return state;
}
async function request(method, route, body, auth = null, file = null) {
  checkpoint();
  const response = await app.inject({
    method,
    url: PREFIX + route,
    headers: {
      origin: ORIGIN,
      ...(auth ? { cookie: auth.cookie, "x-csrf-token": auth.csrfToken } : {}),
      ...(file ? { "content-type": file.contentType } : {}),
    },
    payload: file ? file.body : body,
  });
  if (response.statusCode !== 200) {
    let code;
    try {
      code = response.json().error?.code;
    } catch {
      code = null;
    }
    fault(
      typeof code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(code)
        ? code
        : "UNEXPECTED_HTTP_RESPONSE",
    );
  }
  return response;
}
async function login(role) {
  const email = role === "admin" ? ADMIN : TARGET + "@stu.pku.edu.cn";
  const challenge = await request(
    "POST",
    "/auth/request-code",
    role === "admin" ? { role, email } : { role, studentId: TARGET },
  );
  const mail = inbox.get(email);
  must(
    mail?.role === role && /^\d{6}$/.test(mail.code),
    "MOCK_OTP_NOT_DELIVERED",
  );
  const verified = await request("POST", "/auth/verify", {
    challengeId: challenge.json().challengeId,
    code: mail.code,
  });
  const session = verified.json();
  must(
    session.user.role === role &&
      (role !== "student" || session.user.studentId === TARGET),
    "UNEXPECTED_SESSION_IDENTITY",
  );
  return {
    cookie: verified.headers["set-cookie"].split(";")[0],
    csrfToken: session.csrfToken,
  };
}
async function awaitBatch(batchId, auth) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    checkpoint();
    await app.synchronize();
    const batch = (
      await request("GET", "/admin/imports/" + batchId, null, auth)
    ).json();
    must(
      batch.items.length === 1 && batch.items[0].studentId === TARGET,
      "UNEXPECTED_BATCH_ITEMS",
    );
    if (batch.status === "completed") {
      must(batch.items[0].status === "success", "BATCH_NOT_SUCCESSFUL");
      return batch;
    }
    if (["partial", "failed"].includes(batch.status))
      fault("LIVE_BATCH_FAILED");
    await delay(250);
  }
  fault("LIVE_BATCH_TIMEOUT");
}
async function approve(auth, action, key = null) {
  safeCurrent();
  const keyAction = action !== "install";
  const preview = (
    await request(
      "POST",
      keyAction ? "/admin/key-actions/preview" : "/admin/imports/preview",
      keyAction
        ? {
            studentId: TARGET,
            action,
            ...(action === "restore" ? { keyId: key.id } : {}),
          }
        : { studentIds: [TARGET] },
      auth,
    )
  ).json();
  must(
    preview.items.length === 1 &&
      preview.items[0].studentId === TARGET &&
      preview.items[0].eligible,
    "LIVE_PREVIEW_NOT_ELIGIBLE",
  );
  const fingerprint = preview.items[0].fingerprint;
  must(ownFingerprints.has(fingerprint), "UNEXPECTED_PREVIEW_FINGERPRINT");
  if (key) must(fingerprint === key.fingerprint, "WRONG_PREVIEW_KEY");
  const batch = (
    await request(
      "POST",
      keyAction ? "/admin/key-actions" : "/admin/imports",
      { previewId: preview.previewId, requestId: crypto.randomUUID() },
      auth,
    )
  ).json();
  await awaitBatch(batch.id, auth);
  const state = safeCurrent();
  must(state.generation > stateGeneration, "GENERATION_DID_NOT_ADVANCE");
  must(
    state.action === (action === "revoke" ? "revoke" : "install"),
    "WRONG_INSTALLED_ACTION",
  );
  must(
    state.fingerprint === (action === "revoke" ? null : fingerprint),
    "WRONG_INSTALLED_FINGERPRINT",
  );
  stateGeneration = state.generation;
  log(phase, state);
  return state;
}
async function submitAndAwaitTerminal(request) {
  const deadline = Date.now() + 120_000;
  let job = null;
  while (Date.now() < deadline) {
    try {
      job = job ? await live.get(job.id) : await live.submit(request);
      must(
        job.items.length === 1 && job.items[0].studentId === TARGET,
        "UNEXPECTED_CLEANUP_JOB",
      );
      if (!["queued", "running"].includes(job.status)) return job;
    } catch (error) {
      if (error.code === "UNEXPECTED_CLEANUP_JOB") throw error;
      // A lost acknowledgement is retried with exactly the same payload/request ID.
    }
    await delay(250);
  }
  fault("CLEANUP_JOB_TIMEOUT");
}

try {
  const initial = readState();
  must(
    ["none", "revoke"].includes(initial.action) && initial.fingerprint === null,
    "INITIAL_UNKNOWN_INSTALL_REFUSED",
  );
  safeInitialState = true;
  stateGeneration = initial.generation;
  log("initial-safe-state", initial);
  const accounts = await tracked.check([TARGET]);
  must(
    accounts.length === 1 &&
      accounts[0].studentId === TARGET &&
      accounts[0].status === "ready",
    "TEST_ACCOUNT_NOT_AUTHORIZED",
  );
  app = await createApp({
    config,
    importer: tracked,
    mailer: {
      configured: true,
      async sendCode(mail) {
        must(
          [ADMIN, TARGET + "@stu.pku.edu.cn"].includes(mail.to),
          "UNEXPECTED_MOCK_RECIPIENT",
        );
        inbox.set(mail.to, { code: mail.code, role: mail.role });
      },
    },
  });
  await app.ready();
  phase = "mock-admin-login";
  const admin = await login("admin");
  phase = "isolated-roster";
  const roster = (
    await request(
      "POST",
      "/admin/roster/preview",
      null,
      admin,
      upload("acceptance.csv", `学号,姓名\n${TARGET},专用验收测试账号\n`),
    )
  ).json();
  must(
    roster.errors.length === 0 &&
      roster.rows.length === 1 &&
      roster.rows[0].studentId === TARGET,
    "UNEXPECTED_TEST_ROSTER",
  );
  await request(
    "POST",
    "/admin/roster/commit",
    { previewId: roster.previewId },
    admin,
  );
  phase = "mock-student-login";
  const student = await login("student");
  const first = ephemeralKey(),
    second = ephemeralKey();
  ownFingerprints.add(first.fingerprint);
  ownFingerprints.add(second.fingerprint);
  phase = "first-upload";
  const firstUploaded = (
    await request(
      "POST",
      "/me/key",
      null,
      student,
      upload("acceptance-first.pub", first.publicKey),
    )
  ).json().student.latestKey;
  must(
    firstUploaded.fingerprint === first.fingerprint &&
      submitted.size === 0 &&
      readState().generation === stateGeneration,
    "UPLOAD_UNEXPECTEDLY_INSTALLED_KEY",
  );
  log(phase, {
    action: "pending_review",
    generation: stateGeneration,
    fingerprint: first.fingerprint,
  });
  phase = "first-install";
  await approve(admin, "install", firstUploaded);
  phase = "replacement-upload";
  const secondUploaded = (
    await request(
      "POST",
      "/me/key",
      null,
      student,
      upload("acceptance-second.pub", second.publicKey),
    )
  ).json().student.latestKey;
  must(
    secondUploaded.fingerprint === second.fingerprint &&
      readState().fingerprint === first.fingerprint,
    "REPLACEMENT_UPLOAD_CHANGED_ACTIVE_KEY",
  );
  log(phase, {
    action: "pending_review",
    generation: stateGeneration,
    fingerprint: second.fingerprint,
  });
  phase = "replacement-install";
  await approve(admin, "install", secondUploaded);
  phase = "revoke-replacement";
  await approve(admin, "revoke", secondUploaded);
  phase = "restore-first";
  await approve(admin, "restore", firstUploaded);
  phase = "final-api-revoke";
  await approve(admin, "revoke", firstUploaded);
  must(
    (await request("GET", "/me", null, student)).json().student.installedKey ===
      null,
    "WEB_STATE_NOT_REVOKED",
  );
  passed = true;
} catch (error) {
  failure = errorCode(error);
  log("failed-at-" + phase, null, failure);
} finally {
  // Stop the in-memory outbox before draining every request it might have sent.
  if (app) {
    try {
      await app.close();
    } catch {
      passed = false;
      failure ||= "WEB_SHUTDOWN_FAILED";
    }
  }
  if (safeInitialState) {
    try {
      for (const request of submitted.values())
        await submitAndAwaitTerminal(request);
      let state = safeCurrent();
      if (state.action === "install") {
        const cleanup = {
          requestId: crypto.randomUUID(),
          items: [
            {
              studentId: TARGET,
              action: "revoke",
              publicKey: null,
              fingerprint: state.fingerprint,
            },
          ],
        };
        const result = await submitAndAwaitTerminal(cleanup);
        must(
          result.status === "completed" && result.items[0].status === "success",
          "CLEANUP_REVOKE_FAILED",
        );
        state = safeCurrent();
      }
      must(
        state.action !== "install" && state.fingerprint === null,
        "CLEANUP_STATE_NOT_REVOKED",
      );
      cleanupSucceeded = true;
      log("cleanup-verified", state);
    } catch (error) {
      failure ||= errorCode(error);
      log("CLEANUP_REQUIRED", null, errorCode(error));
      try {
        log("cleanup-observed-state", readState());
      } catch {
        log("cleanup-state-unreadable");
      }
    }
  } else log("no-mutation-initial-state-refused");
  inbox.clear();
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
if (passed && cleanupSucceeded) {
  log("PASS-live-worker-acceptance");
  process.exitCode = 0;
} else {
  log(
    cleanupSucceeded ? "FAIL-cleanup-verified" : "FAIL-operator-check-required",
    null,
    failure || "ACCEPTANCE_FAILED",
  );
  process.exitCode = 1;
}
