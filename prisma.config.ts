import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration (Prisma ORM 7).
 *
 * The CLI (migrate, studio, db pull) uses `datasource.url`. On Neon this must be the
 * DIRECT (non-pooled) connection string, because migrations need session-level
 * features that PgBouncer transaction pooling does not provide. The running server
 * uses the POOLED `DATABASE_URL` through the driver adapter (see src/lib/prisma.ts).
 *
 * `prisma generate` does not connect, so an empty URL is acceptable for it.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? "",
  },
});
