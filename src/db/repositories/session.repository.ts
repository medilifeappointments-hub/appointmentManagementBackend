import { getPrisma } from "../prisma.js";

export const create = (userId: string, tokenHash: string, expiresAt: Date) =>
  getPrisma().session.create({ data: { tokenHash, userId, expiresAt }, select: { id: true } });

export const findByTokenHash = (tokenHash: string) =>
  getPrisma().session.findUnique({ where: { tokenHash }, include: { user: true } });

export const deleteById = (id: string) => getPrisma().session.deleteMany({ where: { id } });

export const touch = (id: string, lastSeenAt: Date) =>
  getPrisma().session.updateMany({ where: { id }, data: { lastSeenAt } });

export const deleteExpired = (now: Date) => getPrisma().session.deleteMany({ where: { expiresAt: { lte: now } } });
