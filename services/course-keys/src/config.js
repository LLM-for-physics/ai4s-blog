import crypto from "node:crypto";
import path from "node:path";
import { loadTargets } from "./targets.js";
function pilotStudentIds(raw) {
  if (raw === undefined || raw.trim() === "") return [];
  const ids = raw.split(",").map((value) => value.trim());
  if (ids.length > 2000 || ids.some((value) => !/^[0-9]{6,16}$/.test(value)))
    throw new Error("COURSE_KEYS_ENROLLMENT_PILOT_IDS must contain comma-separated 6 to 16 digit student IDs");
  return [...new Set(ids)];
}
export function enrollmentMode(config) {
  return config.enrollmentOpen ? "open" : config.enrollmentPilotIds?.length ? "pilot" : "closed";
}
export function canStudentEnroll(config, studentId) {
  return config.enrollmentOpen || Boolean(config.enrollmentPilotIds?.includes(studentId));
}
export function loadConfig(env = process.env, mode = "web") {
  const production = env.NODE_ENV === "production";
  const config = {
    production,
    host: env.COURSE_KEYS_HOST || "127.0.0.1",
    port: Number(env.COURSE_KEYS_PORT || 3081),
    origin: env.COURSE_KEYS_ORIGIN || "http://127.0.0.1:3081",
    dbPath:
      env.COURSE_KEYS_DB || "/var/lib/course-key-service/web/keys.sqlite3",
    importerDbPath:
      env.COURSE_KEYS_IMPORTER_DB ||
      "/var/lib/course-key-service/importer/jobs.sqlite3",
    importerSocket:
      env.COURSE_KEYS_IMPORTER_SOCKET ||
      "/run/course-keys-importer/importer.sock",
    secret:
      env.COURSE_KEYS_SECRET ||
      (production ? "" : crypto.randomBytes(48).toString("hex")),
    enrollmentOpen: env.COURSE_KEYS_ENROLLMENT_OPEN === "true",
    enrollmentPilotIds: pilotStudentIds(env.COURSE_KEYS_ENROLLMENT_PILOT_IDS),
    adminEmails: (env.COURSE_KEYS_ADMIN_EMAILS || "")
      .toLowerCase()
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    studentEmailDomain:
      env.COURSE_KEYS_STUDENT_EMAIL_DOMAIN || "stu.pku.edu.cn",
    serverId: "190",
    servers: ["132", "190", "197"].map((id) => ({ id, label: id })),
    helperTargets: mode === "worker" ? loadTargets(env, production) : {},
    trustProxy: env.COURSE_KEYS_TRUST_PROXY === "true",
    smtp: {
      host: env.SMTP_HOST || "",
      port: Number(env.SMTP_PORT || 465),
      secure: env.SMTP_SECURE !== "false",
      user: env.SMTP_USER || "",
      pass: env.SMTP_PASS || "",
      from: env.SMTP_FROM || env.SMTP_USER || "",
    },
    helperCommand: "/usr/bin/sudo",
    helperArgs: [
      "-n",
      "/usr/bin/python3",
      "-I",
      "-S",
      "/usr/local/libexec/course-keys/helper.py",
    ],
    pollMs: 1500,
    otpTtlMs: 10 * 60_000,
    sessionTtlMs: 8 * 60 * 60_000,
    freshAuthMs: 10 * 60_000,
  };
  if (mode === "web" && config.secret.length < 32)
    throw new Error("COURSE_KEYS_SECRET must contain at least 32 characters");
  if (
    !["http:", "https:"].includes(new URL(config.origin).protocol) ||
    new URL(config.origin).origin !== config.origin
  )
    throw new Error("COURSE_KEYS_ORIGIN must be an exact origin");
  if (mode === "web" && production && !config.origin.startsWith("https://"))
    throw new Error("Production requires HTTPS origin");
  for (const p of [config.dbPath, config.importerDbPath, config.importerSocket])
    if (p !== ":memory:" && !path.isAbsolute(p))
      throw new Error("Data/socket paths must be absolute");
  return config;
}
