import http from "node:http";
import { AppError } from "./security.js";
export function createImporterClient(config) {
  const call = (method, path, body) =>
    new Promise((resolve, reject) => {
      const text = body === undefined ? null : JSON.stringify(body);
      const req = http.request(
        {
          socketPath: config.importerSocket,
          path,
          method,
          headers: text
            ? {
                "content-type": "application/json",
                "content-length": Buffer.byteLength(text),
              }
            : {},
        },
        (res) => {
          const parts = [];
          let size = 0;
          res.on("data", (b) => {
            size += b.length;
            if (size > 8 * 1024 * 1024) {
              res.destroy();
              reject(new Error("Importer response too large"));
            } else parts.push(b);
          });
          res.on("error", reject);
          res.on("end", () => {
            try {
              const value = JSON.parse(Buffer.concat(parts));
              if (res.statusCode >= 400)
                reject(
                  new AppError(
                    value.error?.code || "IMPORTER_ERROR",
                    value.error?.message || "导入服务拒绝请求",
                    res.statusCode,
                  ),
                );
              else resolve(value);
            } catch (e) {
              reject(e);
            }
          });
        },
      );
      req.setTimeout(30_000, () => req.destroy(new Error("Importer timeout")));
      req.on("error", reject);
      req.end(text);
    });
  return {
    check: async (targets) =>
      (await call("POST", "/check", { targets })).accounts,
    submit: (request) => call("POST", "/jobs", request),
    get: (jobId) => call("GET", `/jobs/${encodeURIComponent(jobId)}`),
  };
}
