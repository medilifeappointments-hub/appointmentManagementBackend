/**
 * Development-only PostgreSQL for working without Neon (or Docker).
 * Runs a persistent embedded PostgreSQL server in ./.local-db until stopped (Ctrl+C).
 *
 *   npm run db:local
 *
 * Then point DATABASE_URL and DIRECT_URL at:
 *   postgresql://postgres:<LOCAL_DB_PASSWORD>@127.0.0.1:<LOCAL_DB_PORT>/clinic_dev
 * Never use this for production data.
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const dataDir = resolve(".local-db");
const port = Number(process.env.LOCAL_DB_PORT ?? 5433);
const password = process.env.LOCAL_DB_PASSWORD;
const database = "clinic_dev";

async function main() {
  if (!password) throw new Error("Set LOCAL_DB_PASSWORD in .env before starting the local database.");

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: "postgres",
    password,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
  });

  const firstRun = !existsSync(resolve(dataDir, "PG_VERSION"));
  if (firstRun) await pg.initialise();
  await pg.start();
  if (firstRun) await pg.createDatabase(database);

  console.log(`Local PostgreSQL running on 127.0.0.1:${port}, database "${database}". Press Ctrl+C to stop.`);

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Local database failed to start");
  process.exit(1);
});
