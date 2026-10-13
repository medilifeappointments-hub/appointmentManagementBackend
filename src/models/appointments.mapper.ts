import type { Appointment, Prisma } from "../generated/prisma/client.js";
import { instantToClinicLocal } from "../utils/clinicTime.js";
import { formatMoney, toDecimal } from "../utils/money.js";
import type { AppointmentFieldsInput } from "./appointments.schemas.js";

const userRef = { select: { id: true, name: true } } as const;

/** Relations included whenever an appointment is returned to the client. */
export const appointmentInclude = {
  createdBy: userRef,
  updatedBy: userRef,
  archivedBy: userRef,
} satisfies Prisma.AppointmentInclude;

export type AppointmentWithUsers = Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>;

export interface UserRefDto {
  id: string;
  name: string;
}

export interface AppointmentDto {
  id: string;
  recordNumber: number;
  clinicNumber: string;
  patientType: "NEW" | "OLD";
  cs: string | null;
  team: string;
  mobileNo: string;
  patientName: string;
  location: string | null;
  /** UTC instant (ISO 8601). */
  appointmentAt: string;
  /** Same instant as clinic-local wall-clock time "YYYY-MM-DDTHH:mm". */
  appointmentLocal: string;
  procedure: string;
  amount: string | null;
  resultIssued: string | null;
  cost: string | null;
  paymentMethod: "CASH" | "CARD" | "MIXED" | null;
  cashAmount: string | null;
  cardAmount: string | null;
  status: string | null;
  approvalCode: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  createdBy: UserRefDto;
  updatedBy: UserRefDto;
  archivedBy: UserRefDto | null;
}

export function toAppointmentDto(row: AppointmentWithUsers): AppointmentDto {
  return {
    id: row.id,
    recordNumber: row.recordNumber,
    clinicNumber: row.clinicNumber,
    patientType: row.patientType,
    cs: row.cs,
    team: row.team,
    mobileNo: row.mobileNo,
    patientName: row.patientName,
    location: row.location,
    appointmentAt: row.appointmentAt.toISOString(),
    appointmentLocal: instantToClinicLocal(row.appointmentAt),
    procedure: row.procedure,
    amount: formatMoney(row.amount),
    resultIssued: row.resultIssued,
    cost: formatMoney(row.cost),
    paymentMethod: row.paymentMethod,
    cashAmount: formatMoney(row.cashAmount),
    cardAmount: formatMoney(row.cardAmount),
    status: row.status,
    approvalCode: row.approvalCode,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    archivedBy: row.archivedBy,
  };
}

/** Maps validated form input to the Prisma column values it is allowed to write. */
export function toAppointmentData(input: AppointmentFieldsInput) {
  return {
    clinicNumber: input.clinicNumber,
    patientType: input.patientType,
    cs: input.cs,
    team: input.team,
    mobileNo: input.mobileNo,
    patientName: input.patientName,
    location: input.location,
    appointmentAt: input.appointmentLocal,
    procedure: input.procedure,
    amount: toDecimal(input.amount),
    resultIssued: input.resultIssued,
    cost: toDecimal(input.cost),
    paymentMethod: input.paymentMethod,
    cashAmount: toDecimal(input.cashAmount),
    cardAmount: toDecimal(input.cardAmount),
    status: input.status,
    approvalCode: input.approvalCode,
  } satisfies Partial<Prisma.AppointmentUncheckedCreateInput>;
}

/** Business fields tracked in the audit history, in display order. */
export const AUDITED_FIELDS = [
  "clinicNumber",
  "patientType",
  "cs",
  "team",
  "mobileNo",
  "patientName",
  "location",
  "appointmentAt",
  "procedure",
  "amount",
  "resultIssued",
  "cost",
  "paymentMethod",
  "cashAmount",
  "cardAmount",
  "status",
  "approvalCode",
] as const;

export type AuditedField = (typeof AUDITED_FIELDS)[number];
export type AuditSnapshot = Record<AuditedField, string | null>;

/** Comparable string form of each audited field (exact decimals, ISO instants). */
export function toAuditSnapshot(row: Appointment): AuditSnapshot {
  return {
    clinicNumber: row.clinicNumber,
    patientType: row.patientType,
    cs: row.cs,
    team: row.team,
    mobileNo: row.mobileNo,
    patientName: row.patientName,
    location: row.location,
    appointmentAt: row.appointmentAt.toISOString(),
    procedure: row.procedure,
    amount: formatMoney(row.amount),
    resultIssued: row.resultIssued,
    cost: formatMoney(row.cost),
    paymentMethod: row.paymentMethod,
    cashAmount: formatMoney(row.cashAmount),
    cardAmount: formatMoney(row.cardAmount),
    status: row.status,
    approvalCode: row.approvalCode,
  };
}

export type FieldChanges = Partial<Record<AuditedField, { from?: string | null; to: string | null }>>;

export function diffSnapshots(before: AuditSnapshot, after: AuditSnapshot): FieldChanges {
  const changes: FieldChanges = {};
  for (const field of AUDITED_FIELDS) {
    if (before[field] !== after[field]) changes[field] = { from: before[field], to: after[field] };
  }
  return changes;
}

export function creationChanges(after: AuditSnapshot): FieldChanges {
  const changes: FieldChanges = {};
  for (const field of AUDITED_FIELDS) {
    if (after[field] !== null) changes[field] = { to: after[field] };
  }
  return changes;
}
