/**
 * Creates the initial SUPER_ADMIN from environment variables:
 *   SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
 * Run explicitly with `npm run seed:admin`. It never overwrites an existing account
 * and there is no default password. Remove the SEED_* variables afterwards.
 */
import "dotenv/config";
import { z } from "zod";
import { hashPassword } from "../src/utils/password.js";
import { disconnectPrisma, getPrisma } from "../src/db/prisma.js";
import { newPasswordSchema } from "../src/utils/validation.js";

const seedSchema = z.object({
  SEED_ADMIN_NAME: z.string().trim().min(1, "is required").max(100),
  SEED_ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email("must be a valid email")),
  SEED_ADMIN_PASSWORD: newPasswordSchema,
});

async function main() {
  const parsed = seedSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")} ${i.message}`).join("\n");
    throw new Error(`Cannot seed super admin:\n${problems}`);
  }
  const { SEED_ADMIN_NAME: name, SEED_ADMIN_EMAIL: email, SEED_ADMIN_PASSWORD: password } = parsed.data;

  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`An account with email ${email} already exists. Nothing was changed.`);
    return;
  }

  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "SUPER_ADMIN",
      mustChangePassword: false,
    },
  });
  console.log(`Super admin ${email} created. Remove SEED_ADMIN_PASSWORD from the environment now.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Seeding failed");
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
