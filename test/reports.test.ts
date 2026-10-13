import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { disconnectPrisma } from "../src/db/prisma.js";
import { appointmentPayload, createAndLogin, resetDatabase, toUpdatePayload } from "./support/helpers.js";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-11T00:00:00.000Z"));
});
beforeEach(resetDatabase);
afterAll(async () => {
  vi.useRealTimers();
  await disconnectPrisma();
});

describe("admin summary report", () => {
  it("sums exact decimals, excludes blanks and archived records, and groups by receptionist and team", async () => {
    const { client: admin } = await createAndLogin({ role: "SUPER_ADMIN", name: "Admin" });
    const { client: sara, user: saraUser } = await createAndLogin({ name: "Sara" });
    const { client: omar } = await createAndLogin({ name: "Omar" });

    const create = (client: typeof sara, overrides: Record<string, unknown>) =>
      client.post("/api/v1/appointments", appointmentPayload(overrides)).then((res) => res.body.data);

    await create(sara, { team: "Team A", amount: "0.10", cost: "0.05", appointmentLocal: "2026-10-12T09:00" });
    await create(sara, { team: "Team A", amount: "0.20", cost: "", appointmentLocal: "2026-10-12T23:30" });
    await create(omar, { team: "Team B", amount: "", cost: "0", appointmentLocal: "2026-10-13T01:00" });
    // Outside the range (previous clinic day, although same UTC day as the 09:00 entry is not).
    await create(omar, { team: "Team B", amount: "999.00", appointmentLocal: "2026-10-11T23:59" });
    // Archived records are excluded.
    const archived = await create(omar, { team: "Team B", amount: "500.00", appointmentLocal: "2026-10-12T12:00" });
    await admin.post(`/api/v1/admin/appointments/${archived.id}/archive`, { version: archived.version });

    const res = await admin.get("/api/v1/admin/reports/summary?from=2026-10-12&to=2026-10-13");
    expect(res.status).toBe(200);
    const report = res.body.data;

    expect(report.totals).toEqual({
      records: 3,
      recordedAmount: "0.30", // exact: no 0.30000000000000004
      recordedCost: "0.05",
      recordedNet: "0.25",
      amountEntries: 2,
      costEntries: 2,
      recordedCash: "0.00",
      recordedCard: "0.00",
    });
    expect(report.byReceptionist).toEqual([
      {
        userId: saraUser.id,
        name: "Sara",
        records: 2,
        recordedAmount: "0.30",
        recordedCost: "0.05",
        recordedNet: "0.25",
        amountEntries: 2,
        costEntries: 1,
        recordedCash: "0.00",
        recordedCard: "0.00",
      },
      expect.objectContaining({
        name: "Omar",
        records: 1,
        recordedAmount: "0.00",
        recordedCost: "0.00",
        amountEntries: 0,
        costEntries: 1,
      }),
    ]);
    expect(report.byTeam).toEqual([
      expect.objectContaining({ team: "Team A", records: 2, recordedAmount: "0.30" }),
      expect.objectContaining({ team: "Team B", records: 1, recordedAmount: "0.00" }),
    ]);
    expect(report.byPatientType).toEqual([expect.objectContaining({ patientType: "NEW", records: 3 })]);
    expect(report.byClinicNumber).toEqual([expect.objectContaining({ clinicNumber: "+971523452646", records: 3 })]);
    expect(report.archivedRecords).toBe(1);
    expect(report.staff).toEqual({ activeReceptionists: 2, totalReceptionists: 2 });
  });

  it("reflects edits to money values", async () => {
    const { client: admin } = await createAndLogin({ role: "SUPER_ADMIN" });
    const created = await admin.post("/api/v1/appointments", appointmentPayload({ amount: "10.00" }));
    await admin.put(
      `/api/v1/appointments/${created.body.data.id}`,
      toUpdatePayload(created.body.data, { amount: "12.34" }),
    );

    const res = await admin.get("/api/v1/admin/reports/summary?from=2026-10-12&to=2026-10-12");
    expect(res.body.data.totals.recordedAmount).toBe("12.34");
  });

  it("reports cash and card portions of a split payment", async () => {
    const { client: admin } = await createAndLogin({ role: "SUPER_ADMIN" });
    const created = await admin.post(
      "/api/v1/appointments",
      appointmentPayload({
        amount: "100.00",
        paymentMethod: "MIXED",
        cashAmount: "40.00",
        cardAmount: "60.00",
      }),
    );
    expect(created.status).toBe(201);

    const res = await admin.get("/api/v1/admin/reports/summary?from=2026-10-12&to=2026-10-12");
    expect(res.body.data.totals).toEqual(
      expect.objectContaining({ recordedAmount: "100.00", recordedCash: "40.00", recordedCard: "60.00" }),
    );
    expect(res.body.data.byPaymentMethod).toEqual([
      expect.objectContaining({ paymentMethod: "MIXED", records: 1 }),
    ]);
  });

  it("requires a valid date range", async () => {
    const { client: admin } = await createAndLogin({ role: "SUPER_ADMIN" });
    expect((await admin.get("/api/v1/admin/reports/summary")).status).toBe(400);
    expect((await admin.get("/api/v1/admin/reports/summary?from=2026-10-13&to=2026-10-01")).status).toBe(400);
  });
});
