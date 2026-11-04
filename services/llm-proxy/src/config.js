import { readFileSync } from "node:fs";

/** Parse a simple KEY=VALUE env file; quotes are stripped, comments and blanks ignored. */
export function parseEnvFile(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    env[match[1]] = value;
  }
  return env;
}

/** Merge an optional env file under the process environment; real env vars win. */
export function loadEnv(argv = process.argv, processEnv = process.env) {
  const index = argv.indexOf("--env");
  if (index === -1 || !argv[index + 1]) return { ...processEnv };
  return { ...parseEnvFile(readFileSync(argv[index + 1], "utf8")), ...processEnv };
}

const positiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function loadConfig(env = process.env) {
  return {
    host: env.LLM_PROXY_HOST || "127.0.0.1",
    port: positiveInt(env.LLM_PROXY_PORT, 3082),
    baseUrl: (
      env.LLM_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1"
    ).replace(/\/+$/, ""),
    apiKey: env.LLM_API_KEY || "",
    model: env.LLM_MODEL || "deepseek-v4.1-flash-1017",
    // Only enable behind a gateway that forwards X-Forwarded-For; X-Real-IP from
    // our own nginx is always trusted because nginx overwrites client values.
    trustXff: env.LLM_PROXY_TRUST_XFF === "true" || env.LLM_PROXY_TRUST_XFF === "1",
    maxBodyBytes: positiveInt(env.LLM_PROXY_MAX_BODY_BYTES, 128 * 1024),
    maxMessages: positiveInt(env.LLM_PROXY_MAX_MESSAGES, 20),
    maxMessageChars: positiveInt(env.LLM_PROXY_MAX_MESSAGE_CHARS, 8000),
    maxPageChars: positiveInt(env.LLM_PROXY_MAX_PAGE_CHARS, 200),
    maxContextChars: positiveInt(env.LLM_PROXY_MAX_CONTEXT_CHARS, 4000),
    perIpConcurrency: positiveInt(env.LLM_PROXY_PER_IP_CONCURRENCY, 3),
    globalConcurrency: positiveInt(env.LLM_PROXY_GLOBAL_CONCURRENCY, 24),
    perIpHourly: positiveInt(env.LLM_PROXY_PER_IP_HOURLY, 120),
    // Anonymous-abuse controls (SRC #592591): browser-bound sessions with a per-session
    // quota, an origin allowlist, and a global daily ceiling on served messages.
    allowedOrigins: (
      env.LLM_PROXY_ALLOWED_ORIGINS ||
      "https://aiphy.pku.edu.cn,http://localhost:5173,http://127.0.0.1:5173"
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    sessionQuota: positiveInt(env.LLM_PROXY_SESSION_QUOTA, 80),
    sessionTtlMs: positiveInt(env.LLM_PROXY_SESSION_TTL_MS, 24 * 3_600_000),
    perIpSessionsHourly: positiveInt(env.LLM_PROXY_PER_IP_SESSIONS_HOURLY, 20),
    globalDailyQuota: positiveInt(env.LLM_PROXY_GLOBAL_DAILY_QUOTA, 6000),
    upstreamTimeoutMs: positiveInt(env.LLM_PROXY_UPSTREAM_TIMEOUT_MS, 300_000),
  };
}
