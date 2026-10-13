import { Prisma, type Role } from "../../generated/prisma/client.js";
import { getPrisma } from "../prisma.js";

export const findAll = () =>
  getPrisma().user.findMany({ orderBy: [{ role: "asc" }, { isActive: "desc" }, { name: "asc" }] });

export const createUser = (name: string, email: string, passwordHash: string, role: Role) =>
  getPrisma().user.create({
    data: { name, email, passwordHash, role, mustChangePassword: true },
  });

export const runSerializable = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) =>
  getPrisma().$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

export const runTransaction = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => getPrisma().$transaction(work);

export const findById = (tx: Prisma.TransactionClient, id: string) => tx.user.findUnique({ where: { id } });

export const countOtherActiveAdmins = (tx: Prisma.TransactionClient, id: string) =>
  tx.user.count({ where: { role: "SUPER_ADMIN", isActive: true, id: { not: id } } });

export const updateActive = (tx: Prisma.TransactionClient, id: string, isActive: boolean) =>
  tx.user.update({ where: { id }, data: { isActive } });

export const updateTemporaryPassword = (tx: Prisma.TransactionClient, id: string, passwordHash: string) =>
  tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
