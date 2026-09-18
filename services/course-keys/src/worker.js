import { createWorker, listenWorker } from "./worker-app.js";
const app = await createWorker();
try {
  await listenWorker(app);
} catch {
  process.stderr.write(
    "Course-key importer failed to start. Check configuration and socket permissions.\n",
  );
  await app.close();
  process.exitCode = 1;
}
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => void app.close());
