import type { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../prisma.js";

const aggregates = {
  _count: { _all: true, amount: true, cost: true },
  _sum: { amount: true, cost: true, cashAmount: true, cardAmount: true },
} as const;

export async function aggregateSummary(where: Prisma.AppointmentWhereInput, dateWhere: Prisma.AppointmentWhereInput) {
  const prisma = getPrisma();
  const [
    overall,
    byCreator,
    byTeam,
    byStatus,
    byProcedure,
    byLocation,
    byPatientType,
    byClinicNumber,
    byPaymentMethod,
    archivedRecords,
    activeReceptionists,
    totalReceptionists,
  ] = await Promise.all([
    prisma.appointment.aggregate({ where, ...aggregates }),
    prisma.appointment.groupBy({ by: ["createdById"], where, ...aggregates }),
    prisma.appointment.groupBy({ by: ["team"], where, ...aggregates, orderBy: { team: "asc" } }),
    prisma.appointment.groupBy({ by: ["status"], where, ...aggregates }),
    prisma.appointment.groupBy({ by: ["procedure"], where, ...aggregates }),
    prisma.appointment.groupBy({ by: ["location"], where, ...aggregates }),
    prisma.appointment.groupBy({ by: ["patientType"], where, ...aggregates }),
    prisma.appointment.groupBy({ by: ["clinicNumber"], where, ...aggregates }),
    prisma.appointment.groupBy({ by: ["paymentMethod"], where, ...aggregates }),
    prisma.appointment.count({ where: { ...dateWhere, archivedAt: { not: null } } }),
    prisma.user.count({ where: { role: "RECEPTIONIST", isActive: true } }),
    prisma.user.count({ where: { role: "RECEPTIONIST" } }),
  ]);
  const users = await prisma.user.findMany({
    where: { id: { in: byCreator.map((group) => group.createdById) } },
    select: { id: true, name: true },
  });
  return {
    overall,
    byCreator,
    byTeam,
    byStatus,
    byProcedure,
    byLocation,
    byPatientType,
    byClinicNumber,
    byPaymentMethod,
    archivedRecords,
    activeReceptionists,
    totalReceptionists,
    users,
  };
}
