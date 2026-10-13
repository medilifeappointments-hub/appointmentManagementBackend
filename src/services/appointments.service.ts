import { Prisma } from "../generated/prisma/client.js";
import { clinicDayRange } from "../utils/clinicTime.js";
import { ApiError } from "../utils/errors.js";
import { pageMeta, type PageMeta } from "../utils/http.js";
import type { AuthContext } from "../models/auth.types.js";
import { ensureClinicNumberExists } from "./clinic-numbers.service.js";
import {
  creationChanges,
  diffSnapshots,
  toAppointmentData,
  toAppointmentDto,
  toAuditSnapshot,
  type AppointmentDto,
  type FieldChanges,
} from "../models/appointments.mapper.js";
import type {
  CreateAppointmentInput,
  ListAppointmentsQuery,
  UpdateAppointmentInput,
} from "../models/appointments.schemas.js";
import * as repository from "../db/repositories/appointments.repository.js";

const isAdmin = (auth: AuthContext) => auth.user.role === "SUPER_ADMIN";

const notFound = () => ApiError.notFound("Appointment record not found.");

/** 409 carrying the latest record so the client can compare without losing the user's input. */
function versionConflict(current: AppointmentDto): ApiError {
  return new ApiError(409, "VERSION_CONFLICT", "Another user changed this record after you opened it.", { current });
}

const INT32_MAX = 2_147_483_647;

/** Free-text search across patient name, mobile number and record number. */
function searchConditions(q: string): Prisma.AppointmentWhereInput[] {
  const conditions: Prisma.AppointmentWhereInput[] = [{ patientName: { contains: q, mode: "insensitive" } }];
  const digits = q.replace(/[\s\-().#]/g, "");
  if (/^\+?\d+$/.test(digits)) {
    conditions.push({ mobileNo: { contains: digits.replace(/^\+/, "") } });
    const asNumber = Number(digits.replace(/^\+/, ""));
    if (!digits.startsWith("+") && Number.isSafeInteger(asNumber) && asNumber <= INT32_MAX) {
      conditions.push({ recordNumber: asNumber });
    }
  }
  return conditions;
}

export async function listAppointments(
  auth: AuthContext,
  query: ListAppointmentsQuery,
): Promise<{ items: AppointmentDto[]; meta: PageMeta }> {
  if (query.archived !== "active" && !isAdmin(auth)) {
    throw ApiError.forbidden("Only a super admin can view archived records.");
  }

  const where: Prisma.AppointmentWhereInput = {};
  if (query.archived === "active") where.archivedAt = null;
  if (query.archived === "archived") where.archivedAt = { not: null };

  const range = clinicDayRange(query.from, query.to);
  if (range.gte || range.lt) where.appointmentAt = range;

  const insensitive = (value: string) => ({ equals: value, mode: "insensitive" as const });
  if (query.team) where.team = insensitive(query.team);
  if (query.location) where.location = insensitive(query.location);
  if (query.status) where.status = insensitive(query.status);
  if (query.q) where.OR = searchConditions(query.q);

  const orderBy: Prisma.AppointmentOrderByWithRelationInput[] = [{ [query.sortBy]: query.sortOrder }];
  if (query.sortBy !== "recordNumber") orderBy.push({ recordNumber: "desc" });

  const { total, rows } = await repository.findPage(where, orderBy, (query.page - 1) * query.pageSize, query.pageSize);

  return { items: rows.map(toAppointmentDto), meta: pageMeta(query.page, query.pageSize, total) };
}

export async function getAppointment(auth: AuthContext, id: string): Promise<AppointmentDto> {
  const row = await repository.findByIdWithUsers(id);
  // Archived records are invisible to receptionists.
  if (!row || (row.archivedAt && !isAdmin(auth))) throw notFound();
  return toAppointmentDto(row);
}

/** Distinct values used for filter suggestions and form autocomplete. */
export async function getFilterOptions(): Promise<{
  teams: string[];
  locations: string[];
  statuses: string[];
  procedures: string[];
}> {
  const limit = 200;
  const { teams, locations, statuses, procedures } = await repository.findFilterOptions(limit);
  return {
    teams: teams.map((row) => row.team),
    locations: locations.flatMap((row) => (row.location ? [row.location] : [])),
    statuses: statuses.flatMap((row) => (row.status ? [row.status] : [])),
    procedures: procedures.map((row) => row.procedure),
  };
}

/**
 * Idempotent create keyed by the client's submissionKey: retrying the same submission
 * (e.g. after a network failure) returns the record created by the first attempt.
 */
export async function createAppointment(
  auth: AuthContext,
  input: CreateAppointmentInput,
): Promise<{ appointment: AppointmentDto; replayed: boolean }> {
  await ensureClinicNumberExists(input.clinicNumber);
  const existing = await findBySubmissionKey(auth, input.submissionKey);
  if (existing) return { appointment: existing, replayed: true };

  const { submissionKey, ...fields } = input;
  try {
    const appointment = await repository.runTransaction(async (tx) => {
      const row = await repository.create(tx, {
        ...toAppointmentData(fields),
        submissionKey,
        createdById: auth.user.id,
        updatedById: auth.user.id,
      });
      await repository.writeAudit(
        tx,
        row.id,
        auth.user.id,
        "CREATE",
        creationChanges(toAuditSnapshot(row)),
        row.version,
      );
      return row;
    });
    return { appointment: toAppointmentDto(appointment), replayed: false };
  } catch (error) {
    // A concurrent retry with the same key won the race: return its record.
    if (isUniqueViolation(error)) {
      const winner = await findBySubmissionKey(auth, submissionKey);
      if (winner) return { appointment: winner, replayed: true };
    }
    throw error;
  }
}

async function findBySubmissionKey(auth: AuthContext, submissionKey: string): Promise<AppointmentDto | null> {
  const row = await repository.findBySubmissionKey(submissionKey);
  if (!row) return null;
  if (row.createdById !== auth.user.id) {
    throw ApiError.conflict("This submission key was already used. Reload the form and try again.");
  }
  return toAppointmentDto(row);
}

/**
 * Optimistic concurrency: the update applies only if the stored version still equals the
 * version the client edited; the version is incremented atomically in the same statement.
 * The record change and its audit entry commit in one transaction.
 */
export async function updateAppointment(
  auth: AuthContext,
  id: string,
  input: UpdateAppointmentInput,
): Promise<AppointmentDto> {
  await ensureClinicNumberExists(input.clinicNumber);
  const { version, ...fields } = input;

  return repository.runTransaction(async (tx) => {
    const before = await repository.findRawById(tx, id);
    if (!before || (before.archivedAt && !isAdmin(auth))) throw notFound();
    if (before.archivedAt) {
      throw ApiError.conflict("Archived records cannot be edited. Restore the record first.");
    }

    const result = await repository.updateVersioned(tx, id, version, {
      ...toAppointmentData(fields),
      updatedById: auth.user.id,
      version: { increment: 1 },
    });
    if (result.count === 0) throw versionConflict(await loadDto(tx, id));

    // `before` is exactly the state at `version`, because every change bumps the version.
    const after = await repository.findByIdWithUsersOrThrow(tx, id);
    const changes = diffSnapshots(toAuditSnapshot(before), toAuditSnapshot(after));
    await repository.writeAudit(tx, id, auth.user.id, "UPDATE", changes, after.version);
    return toAppointmentDto(after);
  });
}

/** Super admin only (enforced by the router). */
export async function setArchived(
  auth: AuthContext,
  id: string,
  version: number,
  archive: boolean,
): Promise<AppointmentDto> {
  return repository.runTransaction(async (tx) => {
    const current = await repository.findRawById(tx, id);
    if (!current) throw notFound();
    if (Boolean(current.archivedAt) === archive) {
      throw ApiError.conflict(archive ? "This record is already archived." : "This record is not archived.");
    }

    const result = await repository.updateArchived(
      tx,
      id,
      version,
      archive,
      archive
        ? { archivedAt: new Date(), archivedById: auth.user.id, updatedById: auth.user.id, version: { increment: 1 } }
        : { archivedAt: null, archivedById: null, updatedById: auth.user.id, version: { increment: 1 } },
    );
    if (result.count === 0) throw versionConflict(await loadDto(tx, id));

    const after = await repository.findByIdWithUsersOrThrow(tx, id);
    await repository.writeAudit(tx, id, auth.user.id, archive ? "ARCHIVE" : "RESTORE", {}, after.version);
    return toAppointmentDto(after);
  });
}

export interface AuditEventDto {
  id: string;
  action: "CREATE" | "UPDATE" | "ARCHIVE" | "RESTORE";
  changes: FieldChanges;
  version: number;
  createdAt: string;
  actor: { id: string; name: string };
}

export async function getHistory(id: string): Promise<{ appointment: AppointmentDto; events: AuditEventDto[] }> {
  const row = await repository.findByIdWithUsers(id);
  if (!row) throw notFound();
  const events = await repository.findHistory(id);
  return {
    appointment: toAppointmentDto(row),
    events: events.map((event) => ({
      id: event.id,
      action: event.action,
      changes: event.changes as FieldChanges,
      version: event.version,
      createdAt: event.createdAt.toISOString(),
      actor: event.actor,
    })),
  };
}

async function loadDto(tx: Prisma.TransactionClient, id: string): Promise<AppointmentDto> {
  const row = await repository.findByIdWithUsersInTransaction(tx, id);
  if (!row) throw notFound();
  return toAppointmentDto(row);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
