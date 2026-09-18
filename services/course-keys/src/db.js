import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const WEB_SCHEMA = `
  CREATE TABLE students(student_id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,username TEXT NOT NULL,server_id TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,latest_key_id TEXT,installed_key_id TEXT,account_status TEXT NOT NULL DEFAULT 'unchecked',account_message TEXT,import_status TEXT NOT NULL DEFAULT 'not_submitted',last_error TEXT,submitted_at TEXT,removed_at TEXT,removed_by TEXT);
  CREATE TABLE keys(id TEXT PRIMARY KEY,student_id TEXT NOT NULL REFERENCES students(student_id),version INTEGER NOT NULL,public_key TEXT NOT NULL,fingerprint TEXT NOT NULL,algorithm TEXT NOT NULL,bits INTEGER NOT NULL,created_at TEXT NOT NULL,UNIQUE(student_id,version));
  CREATE TABLE challenges(id TEXT PRIMARY KEY,role TEXT NOT NULL,student_id TEXT,email TEXT,code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,consumed INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,role TEXT NOT NULL,student_id TEXT,email TEXT NOT NULL,csrf TEXT NOT NULL,verified_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
  CREATE TABLE rates(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
  CREATE TABLE previews(id TEXT PRIMARY KEY,kind TEXT NOT NULL,admin_email TEXT NOT NULL,payload TEXT NOT NULL,expires_at INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE batches(id TEXT PRIMARY KEY,request_id TEXT UNIQUE NOT NULL,preview_id TEXT NOT NULL UNIQUE,admin_email TEXT NOT NULL,created_at TEXT NOT NULL,remote_id TEXT,dispatch_error TEXT,dispatched INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE batch_items(id INTEGER PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES batches(id),student_id TEXT NOT NULL REFERENCES students(student_id),server_id TEXT NOT NULL,username TEXT NOT NULL,key_id TEXT,action TEXT NOT NULL,revision INTEGER NOT NULL,fingerprint TEXT,public_key TEXT,status TEXT NOT NULL DEFAULT 'queued',error TEXT,generation INTEGER);
  CREATE TABLE audit(id INTEGER PRIMARY KEY,created_at TEXT NOT NULL,actor TEXT NOT NULL,event TEXT NOT NULL,student_id TEXT,detail TEXT);
  CREATE INDEX keys_fingerprint ON keys(fingerprint);
  CREATE INDEX batch_items_student ON batch_items(student_id,id);
`;
const WORKER_SCHEMA = `
  CREATE TABLE jobs(id TEXT PRIMARY KEY,request_id TEXT UNIQUE NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE TABLE targets(student_id TEXT NOT NULL,server_id TEXT NOT NULL,username TEXT NOT NULL,generation INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(server_id,username));
  CREATE TABLE tasks(id INTEGER PRIMARY KEY,job_id TEXT NOT NULL REFERENCES jobs(id),student_id TEXT NOT NULL,server_id TEXT NOT NULL,username TEXT NOT NULL,action TEXT NOT NULL,public_key TEXT,fingerprint TEXT,generation INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'queued',error TEXT);
`;

function migrateWebV3(db) {
  db.exec(`
    ALTER TABLE students ADD COLUMN auto_import_blocked INTEGER NOT NULL DEFAULT 0;
    UPDATE students SET auto_import_blocked=1 WHERE EXISTS (
      SELECT 1 FROM batch_items revoked
      WHERE revoked.student_id=students.student_id AND revoked.action='revoke'
        AND NOT EXISTS (
          SELECT 1 FROM batch_items restored
          WHERE restored.student_id=revoked.student_id AND restored.id>revoked.id
            AND restored.action='install' AND restored.status='success'
        )
    );
    ALTER TABLE batches ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
    CREATE TABLE auto_import_settings(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0,updated_at TEXT,updated_by TEXT);
    INSERT INTO auto_import_settings(id) VALUES(1);
    CREATE TABLE auto_import_candidates(
      student_id TEXT PRIMARY KEY REFERENCES students(student_id),id TEXT UNIQUE NOT NULL,
      key_id TEXT NOT NULL REFERENCES keys(id),server_id TEXT NOT NULL,username TEXT NOT NULL,
      setting_revision INTEGER NOT NULL,status TEXT NOT NULL,message TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL DEFAULT 0,
      batch_id TEXT REFERENCES batches(id)
    );
    CREATE INDEX auto_import_due ON auto_import_candidates(status,next_attempt_at);
  `);
}

export function hasUncertainDeployment(db, studentId) {
  return Boolean(
    db
      .prepare(
        `
    SELECT 1 FROM batch_items uncertain
    WHERE uncertain.student_id=? AND uncertain.status IN ('failed','superseded')
      AND NOT EXISTS (
        SELECT 1 FROM batch_items verified
        WHERE verified.student_id=uncertain.student_id
          AND verified.server_id=uncertain.server_id AND verified.username=uncertain.username
          AND verified.status='success' AND verified.id>uncertain.id
          AND verified.generation IS NOT NULL
          AND (uncertain.generation IS NULL OR verified.generation>uncertain.generation)
      ) LIMIT 1
  `,
      )
      .get(studentId),
  );
}

function migrateV1(db, worker) {
  if (worker) {
    if (
      db
        .prepare(
          "SELECT 1 FROM tasks WHERE status IN ('queued','running') LIMIT 1",
        )
        .get()
    )
      throw new Error(
        "Cannot migrate importer while queued or running tasks remain",
      );
    db.exec(`
      ALTER TABLE tasks ADD COLUMN server_id TEXT NOT NULL DEFAULT '190';
      ALTER TABLE tasks ADD COLUMN username TEXT NOT NULL DEFAULT '';
      UPDATE tasks SET username=student_id;
      ALTER TABLE targets RENAME TO targets_v1;
      CREATE TABLE targets(student_id TEXT NOT NULL,server_id TEXT NOT NULL,username TEXT NOT NULL,generation INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(server_id,username));
      INSERT INTO targets(student_id,server_id,username,generation) SELECT student_id,'190',student_id,generation FROM targets_v1;
      DROP TABLE targets_v1;
    `);
    return;
  }
  if (
    db
      .prepare(
        "SELECT 1 FROM students WHERE installed_key_id IS NOT NULL LIMIT 1",
      )
      .get()
  )
    throw new Error(
      "Cannot migrate web accounts while installed keys remain; revoke and verify first",
    );
  if (
    db
      .prepare(
        "SELECT 1 FROM batch_items WHERE status IN ('queued','running') LIMIT 1",
      )
      .get()
  )
    throw new Error(
      "Cannot migrate web accounts while queued or running tasks remain",
    );
  if (
    db
      .prepare(
        "SELECT 1 FROM students WHERE server_id NOT IN ('fyl190','190','132','197') LIMIT 1",
      )
      .get()
  )
    throw new Error("Cannot migrate an unknown server assignment");
  db.exec(`
    ALTER TABLE students ADD COLUMN removed_at TEXT;
    ALTER TABLE students ADD COLUMN removed_by TEXT;
    ALTER TABLE batch_items ADD COLUMN server_id TEXT NOT NULL DEFAULT '190';
    ALTER TABLE batch_items ADD COLUMN username TEXT NOT NULL DEFAULT '';
    UPDATE batch_items SET
      server_id=(SELECT CASE students.server_id WHEN 'fyl190' THEN '190' ELSE students.server_id END FROM students WHERE students.student_id=batch_items.student_id),
      username=(SELECT students.username FROM students WHERE students.student_id=batch_items.student_id);
  `);
  for (const row of db.prepare("SELECT student_id FROM students").all())
    if (hasUncertainDeployment(db, row.student_id))
      throw new Error(
        "Cannot migrate accounts with an unverified failed deployment",
      );
  db.exec(`
    UPDATE students SET username='stu'||student_id,
      server_id=CASE server_id WHEN 'fyl190' THEN '190' ELSE server_id END,
      account_status='unchecked',account_message=NULL,last_error=NULL,revision=revision+1,
      import_status=CASE WHEN latest_key_id IS NULL THEN 'not_submitted' ELSE 'pending_review' END;
    CREATE INDEX IF NOT EXISTS keys_fingerprint ON keys(fingerprint);
    CREATE INDEX IF NOT EXISTS batch_items_student ON batch_items(student_id,id);
  `);
}

export function openDatabase(filename, worker = false) {
  if (filename !== ":memory:")
    fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new Database(filename);
  try {
    const version = db.pragma("user_version", { simple: true });
    const latestVersion = worker ? 2 : 3;
    if (version > latestVersion || version < 0)
      throw new Error("Database schema is newer than this application");
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    if (filename !== ":memory:") fs.chmodSync(filename, 0o600);
    db.transaction(() => {
      if (version === 0) db.exec(worker ? WORKER_SCHEMA : WEB_SCHEMA);
      else if (version === 1) migrateV1(db, worker);
      if (!worker && version < 3) migrateWebV3(db);
      db.pragma("user_version=" + latestVersion);
    }).immediate();
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
export function audit(db, actor, event, studentId = null, detail = null) {
  db.prepare(
    "INSERT INTO audit(created_at,actor,event,student_id,detail) VALUES(?,?,?,?,?)",
  ).run(new Date().toISOString(), actor, event, studentId, detail);
}
export function rate(db, bucket, limit, periodMs) {
  const now = Date.now();
  return db
    .transaction(() => {
      db.prepare("DELETE FROM rates WHERE expires_at<=?").run(now);
      const found = db
        .prepare("SELECT * FROM rates WHERE bucket=?")
        .get(bucket);
      if (found && found.count >= limit) return false;
      db.prepare(
        "INSERT INTO rates(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1",
      ).run(bucket, now + periodMs);
      return true;
    })
    .immediate();
}
