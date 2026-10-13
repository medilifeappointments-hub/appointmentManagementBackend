import { getPrisma } from "../prisma.js";

export const findUserByEmail = (email: string) => getPrisma().user.findUnique({ where: { email } });

export const findUserById = (id: string) => getPrisma().user.findUnique({ where: { id } });

export async function updatePasswordAndRevokeOtherSessions(
  userId: string,
  passwordHash: string,
  exceptSessionId: string,
): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
    await tx.session.deleteMany({ where: { userId, id: { not: exceptSessionId } } });
  });
}
