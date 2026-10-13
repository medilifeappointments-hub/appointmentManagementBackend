import { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../prisma.js";
import { appointmentInclude, type FieldChanges } from "../../models/appointments.mapper.js";

export const runTransaction = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => getPrisma().$transaction(work);

export async function findPage(
  where: Prisma.AppointmentWhereInput,
  orderBy: Prisma.AppointmentOrderByWithRelationInput[],
  skip: number,
  take: number,
) {
  const prisma = getPrisma();
  const [total, rows] = await prisma.$transaction([
    prisma.appointment.count({ where }),
    prisma.appointment.findMany({ where, include: appointmentInclude, orderBy, skip, take }),
  ]);
  return { total, rows };
}

export const findByIdWithUsers = (id: string) =>
  getPrisma().appointment.findUnique({ where: { id }, include: appointmentInclude });

export const findBySubmissionKey = (submissionKey: string) =>
  getPrisma().appointment.findUnique({ where: { submissionKey }, include: appointmentInclude });

export async function findFilterOptions(limit: number) {
  const prisma = getPrisma();
  const active = { archivedAt: null };
  const [teams, locations, statuses, procedures] = await Promise.all([
    prisma.appointment.findMany({
      where: active,
      distinct: ["team"],
      select: { team: true },
      orderBy: { team: "asc" },
      take: limit,
    }),
    prisma.appointment.findMany({
      where: { ...active, location: { not: null } },
      distinct: ["location"],
      select: { location: true },
      orderBy: { location: "asc" },
      take: limit,
    }),
    prisma.appointment.findMany({
      where: { ...active, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
      orderBy: { status: "asc" },
      take: limit,
    }),
    prisma.appointment.findMany({
      where: active,
      distinct: ["procedure"],
      select: { procedure: true },
      orderBy: { procedure: "asc" },
      take: limit,
    }),
  ]);
  return { teams, locations, statuses, procedures };
}

export const create = (tx: Prisma.TransactionClient, data: Prisma.AppointmentUncheckedCreateInput) =>
  tx.appointment.create({ data, include: appointmentInclude });

export const findRawById = (tx: Prisma.TransactionClient, id: string) => tx.appointment.findUnique({ where: { id } });

export const updateVersioned = (
  tx: Prisma.TransactionClient,
  id: string,
  version: number,
  data: Prisma.AppointmentUncheckedUpdateManyInput,
) => tx.appointment.updateMany({ where: { id, version, archivedAt: null }, data });

export const updateArchived = (
  tx: Prisma.TransactionClient,
  id: string,
  version: number,
  archive: boolean,
  data: Prisma.AppointmentUncheckedUpdateManyInput,
) => tx.appointment.updateMany({ where: { id, version, archivedAt: archive ? null : { not: null } }, data });

export const findByIdWithUsersOrThrow = (tx: Prisma.TransactionClient, id: string) =>
  tx.appointment.findUniqueOrThrow({ where: { id }, include: appointmentInclude });

export const findByIdWithUsersInTransaction = (tx: Prisma.TransactionClient, id: string) =>
  tx.appointment.findUnique({ where: { id }, include: appointmentInclude });

export const writeAudit = (
  tx: Prisma.TransactionClient,
  appointmentId: string,
  actorId: string,
  action: "CREATE" | "UPDATE" | "ARCHIVE" | "RESTORE",
  changes: FieldChanges,
  version: number,
) =>
  tx.auditEvent.create({
    data: { appointmentId, actorId, action, changes: changes as Prisma.InputJsonObject, version },
  });

export const findHistory = (appointmentId: string) =>
  getPrisma().auditEvent.findMany({
    where: { appointmentId },
    include: { actor: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: "asc" }, { version: "asc" }],
  });
