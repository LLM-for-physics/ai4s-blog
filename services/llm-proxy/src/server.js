import { loadConfig, loadEnv } from "./config.js";
import { createApp } from "./app.js";

const config = loadConfig(loadEnv());
const app = createApp(config);
try {
  await new Promise((resolve, reject) => {
    app.once("error", reject);
    app.listen({ port: config.port, host: config.host }, resolve);
  });
} catch {
  process.stderr.write(
    `llm-proxy failed to start on ${config.host}:${config.port}. Check configuration and port availability.\n`,
  );
  app.close();
  process.exitCode = 1;
}
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => void app.close());
