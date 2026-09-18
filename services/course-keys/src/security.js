import crypto from "node:crypto";
import sshpk from "sshpk";
export class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.statusCode = status;
  }
}
export const fail = (code, message, status) => {
  throw new AppError(code, message, status);
};
export const id = () => crypto.randomUUID();
export const token = () => crypto.randomBytes(32).toString("base64url");
export const nowIso = () => new Date().toISOString();
export const digest = (secret, value) =>
  crypto.createHmac("sha256", secret).update(value).digest("hex");
export const safeEqual = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function studentId(value) {
  if (typeof value !== "string" || !/^[0-9]{6,16}$/.test(value))
    fail("INVALID_STUDENT_ID", "学号必须是 6 至 16 位数字文本");
  return value;
}
export function selectedIds(value) {
  if (!Array.isArray(value) || !value.length || value.length > 2000)
    fail("INVALID_SELECTION", "请选择 1 至 2000 位学生");
  const ids = value.map(studentId);
  if (new Set(ids).size !== ids.length)
    fail("DUPLICATE_SELECTION", "学生选择不能重复");
  return ids;
}
export function requestId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(value))
    fail("INVALID_REQUEST_ID", "请求标识无效");
  return value;
}
export function publicKey(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  if (!bytes.length || bytes.length > 4096)
    fail("INVALID_KEY_SIZE", "公钥文件必须为 1 至 4096 字节");
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("INVALID_KEY", "文件不是有效的 SSH 公钥文本");
  }
  if (/PRIVATE KEY|PuTTY-User-Key-File/i.test(text))
    fail("INVALID_KEY", "不是有效的公钥文件，请选择正确的 .pub 文件");
  if (text.includes("\0")) fail("INVALID_KEY", "公钥不能包含二进制内容");
  const line = text.replace(/\r?\n$/, "");
  const match =
    /^(ssh-ed25519|ssh-rsa) ([A-Za-z0-9+/]+={0,2})(?:[ \t]+[^\r\n]*)?$/.exec(
      line,
    );
  if (!match)
    fail(
      "INVALID_KEY",
      "仅接受单行 Ed25519 或 RSA 公钥，不接受额外授权选项或多把密钥",
    );
  const raw = Buffer.from(match[2], "base64");
  if (raw.toString("base64") !== match[2]) fail("INVALID_KEY", "公钥编码无效");
  let offset = 0;
  function part() {
    if (offset + 4 > raw.length) fail("INVALID_KEY", "公钥结构不完整");
    const size = raw.readUInt32BE(offset);
    offset += 4;
    if (size > raw.length - offset) fail("INVALID_KEY", "公钥结构无效");
    const p = raw.subarray(offset, offset + size);
    offset += size;
    return p;
  }
  if (part().toString("ascii") !== match[1])
    fail("INVALID_KEY", "公钥算法与编码不匹配");
  if (match[1] === "ssh-ed25519") {
    if (part().length !== 32) fail("INVALID_KEY", "Ed25519 公钥长度无效");
  } else {
    const exponent = part();
    const modulus = part();
    for (const integer of [exponent, modulus])
      if (
        !integer.length ||
        integer[0] & 128 ||
        (integer.length > 1 && integer[0] === 0 && !(integer[1] & 128))
      )
        fail("INVALID_KEY", "RSA 公钥整数编码无效");
    if (
      !(exponent.at(-1) & 1) ||
      !(modulus.at(-1) & 1) ||
      (exponent.length === 1 && exponent[0] < 3)
    )
      fail("INVALID_KEY", "RSA 公钥参数无效");
  }
  if (offset !== raw.length) fail("INVALID_KEY", "公钥包含多余数据");
  let parsed;
  try {
    parsed = sshpk.parseKey(`${match[1]} ${match[2]}`, "ssh");
  } catch {
    fail("INVALID_KEY", "无法解析为有效 SSH 公钥");
  }
  if (parsed.type === "rsa" && parsed.size < 3072)
    fail("WEAK_KEY", "RSA 公钥至少需要 3072 位，推荐使用 Ed25519");
  if (!["ed25519", "rsa"].includes(parsed.type))
    fail("INVALID_KEY", "不支持该密钥算法");
  return {
    publicKey: `${match[1]} ${match[2]}`,
    fingerprint: `SHA256:${crypto.createHash("sha256").update(raw).digest("base64").replace(/=+$/, "")}`,
    algorithm: parsed.type === "rsa" ? "RSA" : "Ed25519",
    bits: parsed.size,
  };
}
export function forbidExtra(body, names) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((k) => !names.includes(k))
  )
    fail("INVALID_REQUEST", "请求包含不允许的字段");
}
