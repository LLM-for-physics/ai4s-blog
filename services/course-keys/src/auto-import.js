import { audit, hasUncertainDeployment } from "./db.js";
import { canStudentEnroll } from "./config.js";
import { fail, id, nowIso } from "./security.js";

export function autoImportSettings(db) {
  const row = db.prepare("SELECT * FROM auto_import_settings WHERE id=1").get();
  return {
    enabled: Boolean(row.enabled),
    revision: row.revision,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export function autoImportView(db, student) {
  if (student.auto_import_blocked)
    return { status: "blocked", message: "管理员已暂停该学生的自动导入，请由管理员手动导入或恢复公钥" };
  const row = db.prepare(
    "SELECT status,message FROM auto_import_candidates WHERE student_id=? AND key_id=?",
  ).get(student.student_id, student.latest_key_id);
  return { status: row?.status || null, message: row?.message || null };
}

export function cancelAutoImport(db, studentId, message) {
  db.prepare(
    "UPDATE auto_import_candidates SET status='cancelled',message=? WHERE student_id=? AND status IN ('waiting','blocked')",
  ).run(message, studentId);
}

export function recordAutoImport(db, student) {
  cancelAutoImport(db, student.studentId, "已由新提交的公钥取代");
  const setting = autoImportSettings(db);
  if (!setting.enabled) return;
  const blocked = Boolean(student.autoImportBlocked);
  db.prepare(
    `INSERT INTO auto_import_candidates(student_id,id,key_id,server_id,username,setting_revision,status,message)
     VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(student_id) DO UPDATE SET
       id=excluded.id,key_id=excluded.key_id,server_id=excluded.server_id,username=excluded.username,
       setting_revision=excluded.setting_revision,status=excluded.status,message=excluded.message,
       attempts=0,next_attempt_at=0,batch_id=NULL`,
  ).run(
    student.studentId, id(), student.latestKey.id, student.serverId, student.username,
    setting.revision, blocked ? "blocked" : "waiting",
    blocked ? "管理员已暂停该学生的自动导入，请由管理员手动处理" : "等待检查服务器账号并自动导入",
  );
}

export function changeAutoImportSettings(db, enabled, revision, actor) {
  if (typeof enabled !== "boolean" || !Number.isSafeInteger(revision) || revision < 0)
    fail("INVALID_REQUEST", "自动导入开关或版本无效");
  return db.transaction(() => {
    const current = autoImportSettings(db);
    if (current.revision !== revision)
      fail("STALE_AUTO_IMPORT_SETTINGS", "自动导入设置已变更，请刷新后重试", 409);
    if (current.enabled === enabled) return current;
    db.prepare(
      "UPDATE auto_import_settings SET enabled=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=1",
    ).run(enabled ? 1 : 0, nowIso(), actor);
    if (!enabled)
      db.prepare(
        "UPDATE auto_import_candidates SET status='cancelled',message='管理员已关闭自动导入，请等待管理员手动导入' WHERE status IN ('waiting','blocked')",
      ).run();
    audit(db, actor, enabled ? "auto_import_enabled" : "auto_import_disabled", null,
      JSON.stringify({ revision: revision + 1 }));
    return autoImportSettings(db);
  }).immediate();
}

export function createAutoImporter({ db, config, getStudent, checkAccounts, active, approveBatch, wakeSynchronize }) {
  let flight = null, closed = false;
  function finish(candidate, status, message) {
    db.prepare("UPDATE auto_import_candidates SET status=?,message=? WHERE student_id=? AND id=? AND status='waiting'")
      .run(status, message, candidate.student_id, candidate.id);
  }
  function eligible(candidate) {
    const current = db.prepare("SELECT * FROM auto_import_candidates WHERE student_id=?").get(candidate.student_id);
    if (closed || !current || current.id !== candidate.id || current.status !== "waiting") return null;
    const setting = autoImportSettings(db);
    const student = getStudent(candidate.student_id);
    if (!setting.enabled || setting.revision !== current.setting_revision) {
      finish(current, "cancelled", "自动导入设置已变更，请等待管理员手动导入");
      return null;
    }
    if (student.removedAt || student.latestKey?.id !== current.key_id ||
        student.serverId !== current.server_id || student.username !== current.username) {
      finish(current, "cancelled", "学生名单、服务器或公钥已变更，原自动导入已取消");
      return null;
    }
    if (!canStudentEnroll(config, student.studentId)) {
      finish(current, "cancelled", "该学生当前不在公钥登记开放范围，自动导入已取消");
      return null;
    }
    if (student.autoImportBlocked) {
      finish(current, "blocked", "管理员已暂停该学生的自动导入，请由管理员手动处理");
      return null;
    }
    if (active(student.studentId)) return null;
    if (hasUncertainDeployment(db, student.studentId)) {
      finish(current, "blocked", "存在未核验的导入结果，请由管理员检查后手动导入");
      return null;
    }
    if (student.installedKey?.fingerprint === student.latestKey.fingerprint) {
      db.prepare("DELETE FROM auto_import_candidates WHERE student_id=? AND id=?").run(student.studentId, current.id);
      return null;
    }
    return { current, student, setting };
  }
  function defer(candidate, message) {
    const row = db.prepare("SELECT attempts FROM auto_import_candidates WHERE student_id=? AND id=? AND status='waiting'")
      .get(candidate.student_id, candidate.id);
    if (!row) return;
    const delay = Math.min(15 * 60_000, 5_000 * 2 ** Math.min(row.attempts, 8));
    db.prepare("UPDATE auto_import_candidates SET attempts=attempts+1,next_attempt_at=?,message=? WHERE student_id=? AND id=? AND status='waiting'")
      .run(Date.now() + delay, message, candidate.student_id, candidate.id);
  }
  async function processOne(candidate) {
    if (!db.transaction(() => eligible(candidate)).immediate()) return;
    try {
      await checkAccounts([candidate.student_id]);
    } catch {
      db.transaction(() => {
        if (eligible(candidate)) defer(candidate, "账号检查暂未完成，系统稍后自动重查");
      }).immediate();
      return;
    }
    db.transaction(() => {
      const result = eligible(candidate);
      if (!result) return;
      const { student, setting } = result;
      if (student.accountStatus !== "ready") {
        defer(candidate, student.accountStatus === "missing"
          ? "账号不存在，待管理员创建；系统会自动重查"
          : student.accountStatus === "unauthorized"
            ? "账号尚未获准导入，待管理员授权；系统会自动重查"
            : "账号检查暂不可用，系统会自动重查");
        return;
      }
      const batchId = approveBatch({
        source: "automatic",
        actor: setting.updatedBy || "system",
        requestId: "auto_" + candidate.id,
        previewId: "auto_" + candidate.id,
        items: [{
          studentId: student.studentId, serverId: student.serverId, username: student.username,
          keyId: student.latestKey.id, action: "install", revision: student.revision,
          fingerprint: student.latestKey.fingerprint, publicKey: student.latestKey.publicKey,
        }],
      });
      db.prepare("UPDATE auto_import_candidates SET status='queued',message='已批准自动导入，正在等待服务器执行',batch_id=? WHERE student_id=? AND id=?")
        .run(batchId, student.studentId, candidate.id);
      audit(db, setting.updatedBy || "system", "auto_import_approved", student.studentId,
        JSON.stringify({ batchId, keyId: student.latestKey.id, settingRevision: setting.revision }));
    }).immediate();
    wakeSynchronize();
  }
  function processAutoImports() {
    if (closed) return Promise.resolve();
    if (flight) return flight;
    flight = (async () => {
      // Independent server lanes prevent one offline host delaying the other servers.
      const results = await Promise.allSettled(config.servers.map(async ({ id: serverId }) => {
        const candidates = db.prepare(
          "SELECT * FROM auto_import_candidates WHERE server_id=? AND status='waiting' AND next_attempt_at<=? ORDER BY next_attempt_at,student_id LIMIT 20",
        ).all(serverId, Date.now());
        for (const candidate of candidates) {
          if (closed) break;
          await processOne(candidate);
        }
      }));
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected) throw rejected.reason;
    })().finally(() => { flight = null; });
    return flight;
  }
  return {
    processAutoImports,
    async close() {
      closed = true;
      if (flight) await flight;
    },
  };
}
