import { DateTime } from "luxon";
import { getEnv } from "../config/env.js";

/**
 * All appointment times are entered and displayed as clinic-local wall-clock values
 * ("YYYY-MM-DDTHH:mm" in CLINIC_TIMEZONE) and stored as instants (timestamptz).
 * Nothing here depends on the server's or the browser's own timezone.
 */
export const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const LOCAL_DATE_TIME_FORMAT = "yyyy-MM-dd'T'HH:mm";
const LOCAL_DATE_FORMAT = "yyyy-MM-dd";

const clinicZone = () => getEnv().CLINIC_TIMEZONE;

/**
 * Converts a clinic-local wall-clock time to an instant.
 * Returns null for impossible values (e.g. Feb 30, or a time skipped by a DST change),
 * detected by round-tripping, because Luxon silently normalises those.
 */
export function clinicLocalToInstant(local: string, zone = clinicZone()): Date | null {
  if (!LOCAL_DATE_TIME_PATTERN.test(local)) return null;
  const dt = DateTime.fromFormat(local, LOCAL_DATE_TIME_FORMAT, { zone });
  if (!dt.isValid || dt.toFormat(LOCAL_DATE_TIME_FORMAT) !== local) return null;
  return dt.toJSDate();
}

export function instantToClinicLocal(instant: Date, zone = clinicZone()): string {
  return DateTime.fromJSDate(instant, { zone }).toFormat(LOCAL_DATE_TIME_FORMAT);
}

export function isValidLocalDate(value: string, zone = clinicZone()): boolean {
  if (!LOCAL_DATE_PATTERN.test(value)) return false;
  const dt = DateTime.fromFormat(value, LOCAL_DATE_FORMAT, { zone });
  return dt.isValid && dt.toFormat(LOCAL_DATE_FORMAT) === value;
}

/**
 * Half-open instant range [gte, lt) covering whole clinic-local days `from`..`to` inclusive.
 * A 01:00 appointment therefore belongs to the calendar date it was entered on.
 */
export function clinicDayRange(
  from: string | undefined,
  to: string | undefined,
  zone = clinicZone(),
): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {};
  if (from) {
    range.gte = DateTime.fromFormat(from, LOCAL_DATE_FORMAT, { zone }).startOf("day").toJSDate();
  }
  if (to) {
    range.lt = DateTime.fromFormat(to, LOCAL_DATE_FORMAT, { zone }).plus({ days: 1 }).startOf("day").toJSDate();
  }
  return range;
}

export function clinicToday(zone = clinicZone(), now: Date = new Date()): string {
  return DateTime.fromJSDate(now, { zone }).toFormat(LOCAL_DATE_FORMAT);
}
