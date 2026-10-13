import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { getEnv } from "../config/env.js";

export type Db = PrismaClient;

let client: PrismaClient | undefined;

/**
 * Shared Prisma client using the `pg` driver adapter.
 * On Neon, DATABASE_URL must be the POOLED connection string.
 */
export function getPrisma(): PrismaClient {
  if (!client) {
    const adapter = new PrismaPg({
      connectionString: getEnv().DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
    client = new PrismaClient({ adapter });
  }
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
