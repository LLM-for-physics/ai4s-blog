import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase, hasUncertainDeployment } from "../src/db.js";

const sid = "0012345678";
const WEB_V1 = `
CREATE TABLE students(student_id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,username TEXT NOT NULL,server_id TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,latest_key_id TEXT,installed_key_id TEXT,account_status TEXT NOT NULL DEFAULT 'unchecked',account_message TEXT,import_status TEXT NOT NULL DEFAULT 'not_submitted',last_error TEXT,submitted_at TEXT);
CREATE TABLE keys(id TEXT PRIMARY KEY,student_id TEXT NOT NULL REFERENCES students(student_id),version INTEGER NOT NULL,public_key TEXT NOT NULL,fingerprint TEXT NOT NULL,algorithm TEXT NOT NULL,bits INTEGER NOT NULL,created_at TEXT NOT NULL,UNIQUE(student_id,version));
CREATE TABLE challenges(id TEXT PRIMARY KEY,role TEXT NOT NULL,student_id TEXT,email TEXT,code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,consumed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,role TEXT NOT NULL,student_id TEXT,email TEXT NOT NULL,csrf TEXT NOT NULL,verified_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE rates(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE previews(id TEXT PRIMARY KEY,kind TEXT NOT NULL,admin_email TEXT NOT NULL,payload TEXT NOT NULL,expires_at INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE batches(id TEXT PRIMARY KEY,request_id TEXT UNIQUE NOT NULL,preview_id TEXT NOT NULL UNIQUE,admin_email TEXT NOT NULL,created_at TEXT NOT NULL,remote_id TEXT,dispatch_error TEXT,dispatched INTEGER NOT NULL DEFAULT 0);
CREATE TABLE batch_items(id INTEGER PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES batches(id),student_id TEXT NOT NULL REFERENCES students(student_id),key_id TEXT,action TEXT NOT NULL,revision INTEGER NOT NULL,fingerprint TEXT,public_key TEXT,status TEXT NOT NULL DEFAULT 'queued',error TEXT,generation INTEGER);
CREATE TABLE audit(id INTEGER PRIMARY KEY,created_at TEXT NOT NULL,actor TEXT NOT NULL,event TEXT NOT NULL,student_id TEXT,detail TEXT);
PRAGMA user_version=1;`;
const WORKER_V1 = `CREATE TABLE jobs(id TEXT PRIMARY KEY,request_id TEXT UNIQUE NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);CREATE TABLE targets(student_id TEXT PRIMARY KEY,generation INTEGER NOT NULL DEFAULT 0);CREATE TABLE tasks(id INTEGER PRIMARY KEY,job_id TEXT NOT NULL REFERENCES jobs(id),student_id TEXT NOT NULL,action TEXT NOT NULL,public_key TEXT,fingerprint TEXT,generation INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'queued',error TEXT);PRAGMA user_version=1;`;
function legacy(t, worker = false) {
  const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "course-keys-migration-"),
    ),
    filename = path.join(directory, "data.sqlite3");
  t.after(() => {
    assert.equal(
      path.dirname(path.resolve(directory)),
      path.resolve(os.tmpdir()),
    );
    assert.ok(path.basename(directory).startsWith("course-keys-migration-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const db = new Database(filename);
  db.exec(worker ? WORKER_V1 : WEB_V1);
  if (worker) {
    db.prepare(
      "INSERT INTO jobs(id,request_id,payload,created_at) VALUES('old-job','old-request','[]','2026-09-17T00:00:00.000Z')",
    ).run();
    db.prepare("INSERT INTO targets(student_id,generation) VALUES(?,7)").run(
      sid,
    );
    db.prepare(
      "INSERT INTO tasks(job_id,student_id,action,generation,status) VALUES('old-job',?,'revoke',7,'success')",
    ).run(sid);
  } else {
    db.prepare(
      "INSERT INTO students(student_id,name,email,username,server_id,revision,latest_key_id,account_status,import_status) VALUES(?,'旧学生',?,?,'fyl190',5,'old-key','ready','revoked')",
    ).run(sid, sid + "@stu.pku.edu.cn", sid);
    db.prepare(
      "INSERT INTO keys(id,student_id,version,public_key,fingerprint,algorithm,bits,created_at) VALUES('old-key',?,1,'public-test-data','SHA256:test','Ed25519',256,'2026-09-17T00:00:00.000Z')",
    ).run(sid);
    db.prepare(
      "INSERT INTO batches(id,request_id,preview_id,admin_email,created_at) VALUES('old-batch','old-request','old-preview','admin@example.test','2026-09-17T00:00:00.000Z')",
    ).run();
    db.prepare(
      "INSERT INTO batch_items(batch_id,student_id,key_id,action,revision,status,generation) VALUES('old-batch',?,'old-key','revoke',5,'success',7)",
    ).run(sid);
    db.prepare(
      "INSERT INTO audit(created_at,actor,event,student_id,detail) VALUES('2026-09-17T00:00:00.000Z','admin@example.test','retained-history',?,'preserve')",
    ).run(sid);
  }
  return { filename, db };
}
test("web v1 migration preserves historical account targets before deriving stu usernames", (t) => {
  const original = legacy(t);
  original.db.close();
  const db = openDatabase(original.filename);
  try {
    const student = db.prepare("SELECT * FROM students").get(),
      item = db.prepare("SELECT * FROM batch_items").get();
    assert.equal(db.pragma("user_version", { simple: true }), 3);
    assert.equal(student.username, "stu" + sid);
    assert.equal(student.server_id, "190");
    assert.equal(student.revision, 6);
    assert.equal(student.account_status, "unchecked");
    assert.equal(student.latest_key_id, "old-key");
    assert.equal(student.removed_at, null);
    assert.equal(item.username, sid);
    assert.equal(item.server_id, "190");
    assert.equal(db.prepare("SELECT count(*) AS n FROM keys").get().n, 1);
    assert.equal(
      db.prepare("SELECT detail FROM audit").get().detail,
      "preserve",
    );
  } finally {
    db.close();
  }
  const reopened = openDatabase(original.filename);
  try {
    assert.equal(
      reopened.prepare("SELECT revision FROM students").get().revision,
      6,
    );
  } finally {
    reopened.close();
  }
});
for (const scenario of ["installed", "queued", "running", "uncertain"])
  test(
    "web migration refuses " + scenario + " access and rolls back schema edits",
    (t) => {
      const old = legacy(t);
      if (scenario === "installed")
        old.db.prepare("UPDATE students SET installed_key_id='old-key'").run();
      else
        old.db
          .prepare("UPDATE batch_items SET status=?")
          .run(scenario === "uncertain" ? "failed" : scenario);
      old.db.close();
      assert.throws(() => openDatabase(old.filename), /Cannot migrate/);
      const unchanged = new Database(old.filename);
      try {
        assert.equal(unchanged.pragma("user_version", { simple: true }), 1);
        assert.equal(
          unchanged.prepare("SELECT username FROM students").get().username,
          sid,
        );
        assert.equal(
          unchanged
            .pragma("table_info(students)")
            .some((column) => column.name === "removed_at"),
          false,
        );
        assert.equal(
          unchanged
            .pragma("table_info(batch_items)")
            .some((column) => column.name === "server_id"),
          false,
        );
      } finally {
        unchanged.close();
      }
    },
  );
test("worker migration preserves completed legacy accounts and isolates new per-server generation counters", (t) => {
  const old = legacy(t, true);
  old.db.close();
  const db = openDatabase(old.filename, true);
  try {
    const task = db.prepare("SELECT * FROM tasks").get();
    assert.equal(task.server_id, "190");
    assert.equal(task.username, sid);
    assert.equal(
      db
        .prepare(
          "SELECT generation FROM targets WHERE server_id=? AND username=?",
        )
        .get("190", sid).generation,
      7,
    );
    db.prepare(
      "INSERT INTO targets(student_id,server_id,username,generation) VALUES(?,?,?,?)",
    ).run(sid, "190", "stu" + sid, 1);
    db.prepare(
      "INSERT INTO targets(student_id,server_id,username,generation) VALUES(?,?,?,?)",
    ).run(sid, "132", "stu" + sid, 1);
    assert.equal(db.prepare("SELECT count(*) AS n FROM targets").get().n, 3);
    assert.equal(db.prepare("SELECT payload FROM jobs").get().payload, "[]");
  } finally {
    db.close();
  }
});
for (const status of ["queued", "running"])
  test(
    "worker migration refuses " +
      status +
      " legacy tasks without retargeting them",
    (t) => {
      const old = legacy(t, true);
      old.db.prepare("UPDATE tasks SET status=?").run(status);
      old.db.close();
      assert.throws(
        () => openDatabase(old.filename, true),
        /queued or running/,
      );
      const unchanged = new Database(old.filename);
      try {
        assert.equal(unchanged.pragma("user_version", { simple: true }), 1);
        assert.equal(
          unchanged
            .pragma("table_info(tasks)")
            .some((column) => column.name === "username"),
          false,
        );
      } finally {
        unchanged.close();
      }
    },
  );
test("uncertain history is cleared only by a later verified generation on the same server and account", () => {
  const db = openDatabase(":memory:");
  try {
    db.prepare(
      "INSERT INTO students(student_id,name,email,username,server_id) VALUES(?,'模拟学生',?,?,'132')",
    ).run(sid, sid + "@stu.pku.edu.cn", "stu" + sid);
    let counter = 0;
    function record(server, status, generation) {
      const id = String(++counter);
      db.prepare(
        "INSERT INTO batches(id,request_id,preview_id,admin_email,created_at) VALUES(?,?,?,'admin@example.test','now')",
      ).run(id, id, id);
      db.prepare(
        "INSERT INTO batch_items(batch_id,student_id,server_id,username,action,revision,status,generation) VALUES(?,?,?,?,'revoke',1,?,?)",
      ).run(id, sid, server, "stu" + sid, status, generation);
    }
    record("132", "failed", 5);
    record("190", "success", 100);
    assert.equal(hasUncertainDeployment(db, sid), true);
    record("132", "success", 5);
    assert.equal(hasUncertainDeployment(db, sid), true);
    record("132", "success", 6);
    assert.equal(hasUncertainDeployment(db, sid), false);
  } finally {
    db.close();
  }
});
