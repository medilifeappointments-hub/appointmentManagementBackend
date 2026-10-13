import { Prisma } from "../generated/prisma/client.js";
import { clinicDayRange } from "../utils/clinicTime.js";
import type { ReportRange } from "../models/reports.schemas.js";
import * as repository from "../db/repositories/reports.repository.js";

export interface RecordedTotals {
  records: number;
  /** Sum of entered amounts; blank (unknown) amounts are excluded. */
  recordedAmount: string;
  /** Sum of entered costs; blank (unknown) costs are excluded. */
  recordedCost: string;
  recordedNet: string;
  amountEntries: number;
  costEntries: number;
  recordedCash: string;
  recordedCard: string;
}

export interface SummaryReport {
  range: ReportRange;
  totals: RecordedTotals;
  byReceptionist: Array<RecordedTotals & { userId: string; name: string }>;
  byTeam: Array<RecordedTotals & { team: string }>;
  byStatus: Array<RecordedTotals & { status: string }>;
  byProcedure: Array<RecordedTotals & { procedure: string }>;
  byLocation: Array<RecordedTotals & { location: string }>;
  byPatientType: Array<RecordedTotals & { patientType: string }>;
  byClinicNumber: Array<RecordedTotals & { clinicNumber: string }>;
  byPaymentMethod: Array<RecordedTotals & { paymentMethod: string }>;
  archivedRecords: number;
  staff: { activeReceptionists: number; totalReceptionists: number };
}

const sumToString = (value: Prisma.Decimal | null) => (value ? value.toFixed(2) : "0.00");

interface GroupAggregate {
  _count: { _all: number; amount: number; cost: number };
  _sum: {
    amount: Prisma.Decimal | null;
    cost: Prisma.Decimal | null;
    cashAmount: Prisma.Decimal | null;
    cardAmount: Prisma.Decimal | null;
  };
}

function toTotals(group: GroupAggregate): RecordedTotals {
  const amount = group._sum.amount ?? new Prisma.Decimal(0);
  const cost = group._sum.cost ?? new Prisma.Decimal(0);
  return {
    records: group._count._all,
    recordedAmount: sumToString(amount),
    recordedCost: sumToString(cost),
    recordedNet: amount.minus(cost).toFixed(2),
    amountEntries: group._count.amount,
    costEntries: group._count.cost,
    recordedCash: sumToString(group._sum.cashAmount),
    recordedCard: sumToString(group._sum.cardAmount),
  };
}

/** Active-record summary for clinic-local days `from`..`to`. Sums are exact decimals. */
export async function getSummary(range: ReportRange): Promise<SummaryReport> {
  const dateWhere: Prisma.AppointmentWhereInput = {
    appointmentAt: clinicDayRange(range.from, range.to),
  };
  const result = await repository.aggregateSummary({ ...dateWhere, archivedAt: null }, dateWhere);
  const { overall, byCreator, byTeam, users } = result;
  const nameById = new Map(users.map((user) => [user.id, user.name]));
  const breakdown = <T>(groups: T[], value: (group: T) => string | null) =>
    groups
      .map((group) => ({ value: value(group) ?? "Not provided", ...toTotals(group as T & GroupAggregate) }))
      .sort((a, b) => b.records - a.records || a.value.localeCompare(b.value));

  return {
    range,
    totals: toTotals(overall),
    byReceptionist: byCreator
      .map((group) => ({
        userId: group.createdById,
        name: nameById.get(group.createdById) ?? "Unknown user",
        ...toTotals(group),
      }))
      .sort((a, b) => b.records - a.records || a.name.localeCompare(b.name)),
    byTeam: byTeam
      .map((group) => ({ team: group.team, ...toTotals(group) }))
      .sort((a, b) => b.records - a.records || a.team.localeCompare(b.team)),
    byStatus: breakdown(result.byStatus, (group) => group.status).map(({ value, ...totals }) => ({
      status: value,
      ...totals,
    })),
    byProcedure: breakdown(result.byProcedure, (group) => group.procedure).map(({ value, ...totals }) => ({
      procedure: value,
      ...totals,
    })),
    byLocation: breakdown(result.byLocation, (group) => group.location).map(({ value, ...totals }) => ({
      location: value,
      ...totals,
    })),
    byPatientType: breakdown(result.byPatientType, (group) => group.patientType).map(({ value, ...totals }) => ({
      patientType: value,
      ...totals,
    })),
    byClinicNumber: breakdown(result.byClinicNumber, (group) => group.clinicNumber).map(({ value, ...totals }) => ({
      clinicNumber: value,
      ...totals,
    })),
    byPaymentMethod: breakdown(result.byPaymentMethod, (group) => group.paymentMethod).map(({ value, ...totals }) => ({
      paymentMethod: value,
      ...totals,
    })),
    archivedRecords: result.archivedRecords,
    staff: { activeReceptionists: result.activeReceptionists, totalReceptionists: result.totalReceptionists },
  };
}
