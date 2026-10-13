import "dotenv/config";
import { createApp } from "./app.js";
import { getEnv } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { disconnectPrisma } from "./db/prisma.js";
import { purgeExpiredSessions } from "./services/session.service.js";

const SESSION_PURGE_INTERVAL_MS = 60 * 60_000;

async function main() {
  const env = getEnv();
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info("API listening", { port: env.PORT, env: env.NODE_ENV, clinicTimezone: env.CLINIC_TIMEZONE });
  });

  const purge = () =>
    purgeExpiredSessions()
      .then((count) => count > 0 && logger.info("Purged expired sessions", { count }))
      .catch(() => logger.warn("Session purge failed"));
  const purgeTimer = setInterval(purge, SESSION_PURGE_INTERVAL_MS);
  purgeTimer.unref();

  const shutdown = (signal: string) => {
    logger.info("Shutting down", { signal });
    clearInterval(purgeTimer);
    server.close(() => {
      void disconnectPrisma().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  // Environment validation errors are safe to print (they never include values).
  console.error(error instanceof Error ? error.message : "Failed to start server");
  process.exit(1);
});
