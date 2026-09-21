import crypto from "node:crypto";
export function edKey() {
  const pair = crypto.generateKeyPairSync("ed25519"),
    pub = pair.publicKey.export({ format: "jwk" }),
    parts = [Buffer.from("ssh-ed25519"), Buffer.from(pub.x, "base64url")];
  return {
    pair,
    key:
      "ssh-ed25519 " +
      Buffer.concat(
        parts.flatMap((b) => {
          const n = Buffer.alloc(4);
          n.writeUInt32BE(b.length);
          return [n, b];
        }),
      ).toString("base64"),
  };
}
export function multipart(filename, content, fields = {}) {
  const boundary = "test" + crypto.randomBytes(8).toString("hex");
  let body = "";
  for (const [name, value] of Object.entries(fields))
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  return {
    type: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat([
      Buffer.from(
        body +
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      Buffer.from(content),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}
export function helperMock() {
  const targetKey = (value) =>
    typeof value === "object"
      ? `${value.serverId}:${value.username}`
      : /^\d+$/.test(value)
        ? `190:stu${value}`
        : value;
  class TargetMap extends Map {
    get(value) {
      return super.get(targetKey(value));
    }
    set(value, state) {
      return super.set(targetKey(value), state);
    }
    has(value) {
      return super.has(targetKey(value));
    }
    delete(value) {
      return super.delete(targetKey(value));
    }
  }
  class TargetSet extends Set {
    add(value) {
      return super.add(targetKey(value));
    }
    has(value) {
      return super.has(targetKey(value));
    }
    delete(value) {
      return super.delete(targetKey(value));
    }
  }
  const states = new TargetMap(),
    missing = new TargetSet(),
    applies = [];
  let dropNext = false;
  return {
    states,
    missing,
    applies,
    targetKey,
    set dropNextResponse(value) {
      dropNext = value;
    },
    async run(request) {
      const { studentId, serverId, username, operation } = request;
      const identity = { studentId, serverId, username };
      if (missing.has(identity))
        return {
          ok: false,
          ...identity,
          accountStatus: "missing",
          generation: null,
          action: null,
          fingerprint: null,
          publicKey: null,
          changed: false,
          error: { code: "ACCOUNT_MISSING", message: "账号不存在" },
        };
      const state = states.get(identity) || {
        generation: 0,
        action: "none",
        fingerprint: null,
        publicKey: null,
      };
      if (operation === "apply") {
        if (request.generation < state.generation)
          return {
            ok: false,
            ...identity,
            accountStatus: "ready",
            ...state,
            error: { code: "STALE_GENERATION", message: "旧版本" },
          };
        if (
          request.generation === state.generation &&
          (request.action !== state.action ||
            request.fingerprint !== state.fingerprint)
        )
          return {
            ok: false,
            ...identity,
            accountStatus: "ready",
            ...state,
            error: { code: "GENERATION_CONFLICT", message: "版本冲突" },
          };
        if (
          request.action === "revoke" &&
          state.action === "install" &&
          request.expectedFingerprint !== state.fingerprint
        )
          return {
            ok: false,
            ...identity,
            accountStatus: "ready",
            ...state,
            error: {
              code: "EXPECTED_KEY_MISMATCH",
              message: "当前公钥与撤销预览不一致",
            },
          };
        const next = {
          generation: request.generation,
          action: request.action,
          fingerprint: request.fingerprint,
          publicKey: request.publicKey,
        };
        states.set(identity, next);
        applies.push(request);
        if (dropNext) {
          dropNext = false;
          throw new Error("Response lost after durable write");
        }
        return {
          ok: true,
          ...identity,
          accountStatus: "ready",
          ...next,
          changed: true,
          error: null,
        };
      }
      return {
        ok: true,
        ...identity,
        accountStatus: "ready",
        ...state,
        changed: false,
        error: null,
      };
    },
  };
}
