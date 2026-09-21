import fs from "node:fs";
import path from "node:path";
import { fail, studentId, forbidExtra } from "./security.js";

export const SERVER_IDS = ["132", "190", "197"];
export function target(value) {
  const sid = studentId(value?.studentId);
  if (!SERVER_IDS.includes(value?.serverId))
    fail("INVALID_SERVER", "服务器号只能是 132、190 或 197");
  if (value?.username !== "stu" + sid)
    fail("INVALID_USERNAME", "服务器用户名必须为 stu 加学号");
  return { studentId: sid, serverId: value.serverId, username: value.username };
}
function trustedFile(filename) {
  let current = path.resolve(filename);
  if (current !== filename) throw new Error("Target configuration path must be canonical and absolute");
  const file = fs.lstatSync(current);
  if (!file.isFile() || file.isSymbolicLink()) throw new Error("Target configuration must be a regular file");
  for (;;) {
    const s = fs.lstatSync(current);
    if (s.uid !== 0 || (s.mode & 0o022) || s.isSymbolicLink())
      throw new Error("Target configuration and ancestors must be trusted root-owned paths");
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
export function loadTargets(env, production) {
  const filename = env.COURSE_KEYS_TARGETS_FILE;
  // Unconfigured remote targets fail explicitly; they never fall back to 190.
  if (!filename) return { "190": { transport: "local" } };
  if (!path.isAbsolute(filename)) throw new Error("Target configuration path must be absolute");
  if (production) trustedFile(filename);
  if (fs.statSync(filename).size > 16384) throw new Error("Target configuration is too large");
  const value = JSON.parse(fs.readFileSync(filename, "utf8"));
  forbidExtra(value, ["schemaVersion", "targets"]);
  if (value.schemaVersion !== 1 || !value.targets || typeof value.targets !== "object" || Array.isArray(value.targets))
    throw new Error("Invalid target configuration");
  const targets = {};
  for (const [serverId, route] of Object.entries(value.targets)) {
    if (!SERVER_IDS.includes(serverId)) throw new Error("Unknown server in target configuration");
    forbidExtra(route, ["transport", "host", "port", "user", "identityFile", "knownHostsFile"]);
    if (route.transport === "local") {
      if (serverId !== "190" || Object.keys(route).length !== 1) throw new Error("Only 190 may use the local helper");
    } else if (route.transport === "ssh") {
      if (serverId === "190" || !/^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/.test(route.host || "") ||
          !/^[a-z_][a-z0-9_-]{0,31}$/.test(route.user || "") ||
          !Number.isInteger(route.port) || route.port < 1 || route.port > 65535 ||
          ![route.identityFile, route.knownHostsFile].every((v) => typeof v === "string" && path.isAbsolute(v) && !/[\r\n\0]/.test(v)))
        throw new Error("Invalid SSH target configuration");
      if (production) {
        trustedFile(route.knownHostsFile);
        const key = fs.lstatSync(route.identityFile);
        if (!key.isFile() || key.isSymbolicLink() || key.uid !== process.getuid() || (key.mode & 0o077))
          throw new Error("Importer SSH identity must be private to the importer UID");
        const parent = fs.lstatSync(path.dirname(route.identityFile));
        if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== process.getuid() || (parent.mode & 0o077))
          throw new Error("Importer SSH identity directory must be private to the importer UID");
      }
    } else throw new Error("Unknown target transport");
    targets[serverId] = Object.freeze({ ...route });
  }
  return Object.freeze(targets);
}
export function helperInvocation(config, request) {
  const destination = target(request);
  const route = config.helperTargets?.[destination.serverId];
  if (!route) fail("TARGET_NOT_CONFIGURED", `服务器 ${destination.serverId} 尚未配置公钥导入通道`, 503);
  if (route.transport === "local") return { command: config.helperCommand, args: config.helperArgs };
  return {
    command: "/usr/bin/ssh",
    args: ["-F", "/dev/null", "-T", "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes",
      "-o", "StrictHostKeyChecking=yes", "-o", `UserKnownHostsFile=${route.knownHostsFile}`,
      "-o", "GlobalKnownHostsFile=/dev/null", "-o", "ConnectTimeout=8", "-o", "ConnectionAttempts=1",
      "-o", "ClearAllForwardings=yes", "-o", "RequestTTY=no", "-o", "LogLevel=ERROR",
      "-i", route.identityFile, "-p", String(route.port), `${route.user}@${route.host}`],
  };
}
export function checkedResponse(request, response) {
  if (!response || typeof response.ok !== "boolean" ||
      response.studentId !== request.studentId || response.serverId !== request.serverId || response.username !== request.username)
    throw new Error("Helper response destination mismatch");
  if (response.ok && request.operation !== "check" &&
      (!Number.isSafeInteger(response.generation) || response.generation < 0 || !["none", "install", "revoke"].includes(response.action)))
    throw new Error("Invalid helper state");
  return response;
}