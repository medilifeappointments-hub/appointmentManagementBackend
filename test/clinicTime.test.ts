import { describe, expect, it } from "vitest";
import {
  clinicDayRange,
  clinicLocalToInstant,
  clinicToday,
  instantToClinicLocal,
  isValidLocalDate,
} from "../src/utils/clinicTime.js";

describe("clinic time helpers", () => {
  it("converts clinic-local wall time to an instant independent of the server timezone", () => {
    expect(clinicLocalToInstant("2026-10-13T01:00", "Asia/Dubai")?.toISOString()).toBe("2026-10-12T21:00:00.000Z");
    expect(instantToClinicLocal(new Date("2026-10-12T21:00:00.000Z"), "Asia/Dubai")).toBe("2026-10-13T01:00");
  });

  it("rejects impossible dates and times skipped by daylight saving", () => {
    expect(clinicLocalToInstant("2026-02-30T10:00", "Asia/Dubai")).toBeNull();
    expect(clinicLocalToInstant("2026-10-12T24:00", "Asia/Dubai")).toBeNull();
    // 02:30 does not exist in New York on 8 March 2026 (clocks jump 02:00 → 03:00).
    expect(clinicLocalToInstant("2026-03-08T02:30", "America/New_York")).toBeNull();
    expect(clinicLocalToInstant("2026-03-08T03:30", "America/New_York")).not.toBeNull();
  });

  it("builds half-open ranges on clinic-local day boundaries", () => {
    const range = clinicDayRange("2026-10-12", "2026-10-12", "Asia/Dubai");
    expect(range.gte?.toISOString()).toBe("2026-10-11T20:00:00.000Z");
    expect(range.lt?.toISOString()).toBe("2026-10-12T20:00:00.000Z");
  });

  it("handles 23-hour DST days", () => {
    const range = clinicDayRange("2026-03-08", "2026-03-08", "America/New_York");
    expect((range.lt!.getTime() - range.gte!.getTime()) / 3_600_000).toBe(23);
  });

  it("computes today in the clinic timezone", () => {
    // 22:30 UTC on the 12th is already the 13th in Dubai.
    expect(clinicToday("Asia/Dubai", new Date("2026-10-12T22:30:00Z"))).toBe("2026-10-13");
  });

  it("validates local dates", () => {
    expect(isValidLocalDate("2026-10-12", "Asia/Dubai")).toBe(true);
    expect(isValidLocalDate("2026-13-01", "Asia/Dubai")).toBe(false);
    expect(isValidLocalDate("12/10/2026", "Asia/Dubai")).toBe(false);
  });
});
