/**
 * Password reset for a SUPER_ADMIN who cannot sign in (no other admin can reset it in the UI).
 *
 *   npm run admin:reset-password -- admin@example.com
 *
 * - If ADMIN_NEW_PASSWORD is set (e.g. in .env), that password is applied as the admin's
 *   own password. Remove it from .env afterwards.
 * - Otherwise a random temporary password is generated, printed once to this terminal,
 *   and a password change is required at next sign-in.
 * Either way the account is signed out everywhere. Run it on a trusted machine with
 * DATABASE_URL pointing at the intended database.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashPassword } from "../src/utils/password.js";
import { disconnectPrisma, getPrisma } from "../src/db/prisma.js";
import { newPasswordSchema } from "../src/utils/validation.js";
import { revokeUserSessions } from "../src/services/session.service.js";

async function main() {
  const email = z.email().safeParse(process.argv[2]?.trim().toLowerCase());
  if (!email.success) throw new Error("Usage: npm run admin:reset-password -- <admin email>");

  const chosen = process.env.ADMIN_NEW_PASSWORD;
  if (chosen) {
    const check = newPasswordSchema.safeParse(chosen);
    if (!check.success) throw new Error(`ADMIN_NEW_PASSWORD: ${check.error.issues[0]?.message}`);
  }
  const password = chosen || randomBytes(12).toString("base64url");

  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email: email.data } });
    if (!user || user.role !== "SUPER_ADMIN") throw new Error(`No super admin found with email ${email.data}.`);
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password), mustChangePassword: !chosen, isActive: true },
    });
    await revokeUserSessions(tx, user.id);
  });

  if (chosen) {
    console.log(`Password updated for ${email.data}. Remove ADMIN_NEW_PASSWORD from .env now.`);
  } else {
    console.log(`Temporary password for ${email.data}: ${password}`);
    console.log("Sign in with it now; you will be asked to choose a new password.");
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Password reset failed");
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
