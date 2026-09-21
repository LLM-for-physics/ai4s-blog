import { createApp } from "./app.js";
const app = await createApp();
try {
  await app.listen({ host: app.config.host, port: app.config.port });
} catch {
  process.stderr.write(
    "Course-key web service failed to start. Check configuration and runtime permissions.\n",
  );
  await app.close();
  process.exitCode = 1;
}
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => void app.close());
