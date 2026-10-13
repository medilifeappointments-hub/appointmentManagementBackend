/**
 * Provides a migrated PostgreSQL database for the integration tests.
 *
 * - If TEST_DATABASE_URL is set, it is used (its database name must contain "test",
 *   because every test truncates all tables).
 * - Otherwise a throwaway embedded PostgreSQL server is started in a temp directory.
 *
 * The committed migrations are applied with `prisma migrate deploy`, so the tests also
 * verify that the migrations themselves are valid.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address ? resolve(address.port) : reject(new Error("No port")),
      );
    });
  });
}

export default async function setup(project: TestProject) {
  let databaseUrl = process.env.TEST_DATABASE_URL;
  let teardown: () => Promise<void> = async () => {};

  if (databaseUrl) {
    const dbName = new URL(databaseUrl).pathname.slice(1);
    if (!dbName.includes("test")) {
      throw new Error('TEST_DATABASE_URL database name must contain "test" (tests delete all data).');
    }
  } else {
    const dir = mkdtempSync(join(tmpdir(), "clinic-pg-"));
    const port = await freePort();
    const password = "test-only-password";
    const pg = new EmbeddedPostgres({
      databaseDir: dir,
      port,
      user: "postgres",
      password,
      persistent: false,
      initdbFlags: ["--encoding=UTF8", "--locale=C"],
      onLog: () => {},
      onError: () => {},
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase("clinic_test");
    databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/clinic_test`;
    teardown = async () => {
      await pg.stop();
      rmSync(dir, { recursive: true, force: true });
    };
  }

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DIRECT_URL: databaseUrl },
    stdio: "pipe",
  });

  project.provide("databaseUrl", databaseUrl);
  return teardown;
}
