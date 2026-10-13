import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { disconnectPrisma, getPrisma } from "../src/db/prisma.js";
import {
  appointmentPayload,
  createAndLogin,
  resetDatabase,
  type TestClient,
  toUpdatePayload,
} from "./support/helpers.js";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-11T00:00:00.000Z"));
});
beforeEach(resetDatabase);
afterAll(async () => {
  vi.useRealTimers();
  await disconnectPrisma();
});

const issueFields = (body: { error: { details: { issues: Array<{ field: string }> } } }) =>
  body.error.details.issues.map((issue) => issue.field);

async function createRecord(client: TestClient, overrides: Record<string, unknown> = {}) {
  const res = await client.post("/api/v1/appointments", appointmentPayload(overrides));
  expect(res.status).toBe(201);
  return res.body.data;
}

describe("appointment validation", () => {
  it("lists clinic numbers and lets a receptionist add a shared number", async () => {
    const { client } = await createAndLogin();
    const initial = await client.get("/api/v1/clinic-numbers");
    expect(initial.body.data).toContain("+971523452646");

    const added = await client.post("/api/v1/clinic-numbers", { number: "+971 55 123 4567" });
    expect(added.status).toBe(201);
    expect(added.body.data.number).toBe("+971551234567");
    expect((await client.get("/api/v1/clinic-numbers")).body.data).toContain("+971551234567");
  });

  it("rejects a new appointment in the past", async () => {
    const { client } = await createAndLogin();
    const res = await client.post("/api/v1/appointments", appointmentPayload({ appointmentLocal: "2026-10-10T23:59" }));
    expect(res.status).toBe(400);
    expect(issueFields(res.body)).toContain("appointmentLocal");
  });

  it("creates a record, trims text, normalises the phone and keeps blanks as null", async () => {
    const { user, client } = await createAndLogin();
    const record = await createRecord(client, {
      patientName: "  Aisha Khan  ",
      mobileNo: " +971 (50) 123-4567 ",
      cs: "   ",
      approvalCode: "000123",
    });

    expect(record).toMatchObject({
      recordNumber: expect.any(Number),
      patientName: "Aisha Khan",
      mobileNo: "+971501234567",
      team: "SHIM/ZUBAIR",
      cs: null,
      location: "Dubai Marina",
      amount: null,
      cost: null,
      paymentMethod: null,
      status: null,
      approvalCode: "000123",
      version: 1,
      createdBy: { id: user.id, name: user.name },
      updatedBy: { id: user.id, name: user.name },
    });
  });

  it("reports every invalid or missing required field", async () => {
    const { client } = await createAndLogin();
    const res = await client.post("/api/v1/appointments", {
      submissionKey: randomUUID(),
      patientType: "MAYBE",
      team: " ",
      mobileNo: "12ab",
      patientName: "",
      appointmentLocal: "2026-02-30T10:00",
      procedure: "",
    });
    expect(res.status).toBe(400);
    expect(issueFields(res.body)).toEqual(
      expect.arrayContaining(["patientType", "team", "mobileNo", "patientName", "appointmentLocal", "procedure"]),
    );
  });

  it("enforces field length limits", async () => {
    const { client } = await createAndLogin();
    const res = await client.post(
      "/api/v1/appointments",
      appointmentPayload({ patientName: "x".repeat(151), cs: "y".repeat(51) }),
    );
    expect(res.status).toBe(400);
    expect(issueFields(res.body)).toEqual(expect.arrayContaining(["patientName", "cs"]));
  });

  it("rejects fields that are not writable (mass assignment)", async () => {
    const { client } = await createAndLogin();
    const res = await client.post(
      "/api/v1/appointments",
      appointmentPayload({ createdById: randomUUID(), recordNumber: 5, version: 9 }),
    );
    expect(res.status).toBe(400);
    expect(await getPrisma().appointment.count()).toBe(0);
  });

  it("does not make mobile numbers unique", async () => {
    const { client } = await createAndLogin();
    await createRecord(client, { patientName: "Parent" });
    await createRecord(client, { patientName: "Child" });
    expect(await getPrisma().appointment.count({ where: { mobileNo: "+971501234567" } })).toBe(2);
  });
});

describe("money handling", () => {
  it("stores exact decimals and distinguishes blank (unknown) from zero", async () => {
    const { client } = await createAndLogin();
    const record = await createRecord(client, { amount: "1250.5", cost: "0" });
    expect(record.amount).toBe("1250.50");
    expect(record.cost).toBe("0.00");

    const blank = await createRecord(client, { amount: "", cost: null });
    expect(blank.amount).toBeNull();
    expect(blank.cost).toBeNull();
  });

  it.each([
    ["more than two decimals", "10.005"],
    ["negative", "-1.00"],
    ["exponent", "1e3"],
    ["too many digits", "12345678901"],
    ["comma separator", "1,000"],
  ])("rejects %s", async (_label, amount) => {
    const { client } = await createAndLogin();
    const res = await client.post("/api/v1/appointments", appointmentPayload({ amount }));
    expect(res.status).toBe(400);
    expect(issueFields(res.body)).toContain("amount");
  });

  it("rejects JSON numbers so values never pass through floating point", async () => {
    const { client } = await createAndLogin();
    const res = await client.post("/api/v1/appointments", appointmentPayload({ cost: 10.5 }));
    expect(res.status).toBe(400);
    expect(issueFields(res.body)).toContain("cost");
  });

  it("accepts the largest Decimal(12,2) value", async () => {
    const { client } = await createAndLogin();
    const record = await createRecord(client, { amount: "9999999999.99" });
    expect(record.amount).toBe("9999999999.99");
  });
});

describe("duplicate create retries", () => {
  it("returns the original record when the same submission is retried", async () => {
    const { client } = await createAndLogin();
    const payload = appointmentPayload();

    const first = await client.post("/api/v1/appointments", payload);
    const retry = await client.post("/api/v1/appointments", payload);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.meta.replayed).toBe(true);
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(await getPrisma().appointment.count()).toBe(1);
    expect(await getPrisma().auditEvent.count()).toBe(1);
  });

  it("creates one record when identical submissions race", async () => {
    const { client } = await createAndLogin();
    const payload = appointmentPayload();
    const results = await Promise.all(Array.from({ length: 5 }, () => client.post("/api/v1/appointments", payload)));

    expect(results.every((res) => res.status === 200 || res.status === 201)).toBe(true);
    expect(new Set(results.map((res) => res.body.data.id)).size).toBe(1);
    expect(await getPrisma().appointment.count()).toBe(1);
  });

  it("treats same patient details with a new key as a separate record", async () => {
    const { client } = await createAndLogin();
    await createRecord(client);
    await createRecord(client);
    expect(await getPrisma().appointment.count()).toBe(2);
  });

  it("refuses a submission key already used by another user", async () => {
    const { client: a } = await createAndLogin();
    const { client: b } = await createAndLogin();
    const payload = appointmentPayload();
    await a.post("/api/v1/appointments", payload);
    const res = await b.post("/api/v1/appointments", payload);
    expect(res.status).toBe(409);
  });
});

describe("concurrent editing", () => {
  it("returns 409 with the latest record when a second user saves a stale version", async () => {
    const { client: alice } = await createAndLogin({ name: "Alice" });
    const { client: bob } = await createAndLogin({ name: "Bob" });
    const record = await createRecord(alice);

    // Both open version 1.
    const aliceSave = await alice.put(
      `/api/v1/appointments/${record.id}`,
      toUpdatePayload(record, { status: "Confirmed" }),
    );
    expect(aliceSave.status).toBe(200);
    expect(aliceSave.body.data.version).toBe(2);

    const bobSave = await bob.put(`/api/v1/appointments/${record.id}`, toUpdatePayload(record, { procedure: "X-Ray" }));
    expect(bobSave.status).toBe(409);
    expect(bobSave.body.error.code).toBe("VERSION_CONFLICT");
    expect(bobSave.body.error.details.current).toMatchObject({
      version: 2,
      status: "Confirmed",
      procedure: "Consultation",
    });

    // Bob re-applies his change on top of the latest version.
    const retry = await bob.put(
      `/api/v1/appointments/${record.id}`,
      toUpdatePayload(bobSave.body.error.details.current, { procedure: "X-Ray" }),
    );
    expect(retry.status).toBe(200);
    expect(retry.body.data).toMatchObject({ version: 3, status: "Confirmed", procedure: "X-Ray" });
    expect(retry.body.data.updatedBy.name).toBe("Bob");
  });

  it("lets exactly one of two simultaneous saves of the same version win", async () => {
    const { client: alice } = await createAndLogin();
    const { client: bob } = await createAndLogin();
    const record = await createRecord(alice);

    const [a, b] = await Promise.all([
      alice.put(`/api/v1/appointments/${record.id}`, toUpdatePayload(record, { status: "A" })),
      bob.put(`/api/v1/appointments/${record.id}`, toUpdatePayload(record, { status: "B" })),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const stored = await getPrisma().appointment.findUniqueOrThrow({ where: { id: record.id } });
    expect(stored.version).toBe(2);
    expect(await getPrisma().auditEvent.count({ where: { action: "UPDATE" } })).toBe(1);
  });

  it("requires the version on update", async () => {
    const { client } = await createAndLogin();
    const record = await createRecord(client);
    const { version: _version, ...withoutVersion } = toUpdatePayload(record);
    const res = await client.put(`/api/v1/appointments/${record.id}`, withoutVersion);
    expect(res.status).toBe(400);
    expect(issueFields(res.body)).toContain("version");
  });
});

describe("clinic timezone and overnight appointments", () => {
  it("stores a 01:00 clinic-local appointment on its selected calendar date", async () => {
    const { client } = await createAndLogin();
    const record = await createRecord(client, { appointmentLocal: "2026-10-13T01:00" });

    // Asia/Dubai is UTC+4: 01:00 local on the 13th is 21:00 UTC on the 12th.
    expect(record.appointmentAt).toBe("2026-10-12T21:00:00.000Z");
    expect(record.appointmentLocal).toBe("2026-10-13T01:00");

    const onThirteenth = await client.get("/api/v1/appointments?from=2026-10-13&to=2026-10-13");
    const onTwelfth = await client.get("/api/v1/appointments?from=2026-10-12&to=2026-10-12");
    expect(onThirteenth.body.data.map((row: { id: string }) => row.id)).toEqual([record.id]);
    expect(onTwelfth.body.data).toHaveLength(0);
  });

  it("uses clinic-local day boundaries for range filters", async () => {
    const { client } = await createAndLogin();
    const lateNight = await createRecord(client, { appointmentLocal: "2026-10-12T23:59" });
    const midnight = await createRecord(client, { appointmentLocal: "2026-10-13T00:00" });
    const early = await createRecord(client, { appointmentLocal: "2026-10-12T00:00" });

    const day12 = await client.get("/api/v1/appointments?from=2026-10-12&to=2026-10-12");
    expect(day12.body.data.map((row: { id: string }) => row.id).sort()).toEqual([lateNight.id, early.id].sort());

    const both = await client.get("/api/v1/appointments?from=2026-10-12&to=2026-10-13");
    expect(both.body.meta.total).toBe(3);
    // Newest appointment time first by default.
    expect(both.body.data[0].id).toBe(midnight.id);
  });

  it("rejects a range that ends before it starts", async () => {
    const { client } = await createAndLogin();
    const res = await client.get("/api/v1/appointments?from=2026-10-13&to=2026-10-12");
    expect(res.status).toBe(400);
  });
});

describe("listing, search and pagination", () => {
  it("searches patient name, phone and record number, and applies exact filters", async () => {
    const { client } = await createAndLogin();
    const a = await createRecord(client, {
      patientName: "Fatima Ali",
      mobileNo: "+971551112222",
      team: "Team A",
      status: "Done",
    });
    const b = await createRecord(client, {
      patientName: "John Smith",
      mobileNo: "0509998888",
      team: "Team B",
      location: "Deira",
    });

    const byName = await client.get("/api/v1/appointments?q=fatima");
    expect(byName.body.data.map((row: { id: string }) => row.id)).toEqual([a.id]);

    const byPhone = await client.get("/api/v1/appointments?q=999 8888");
    expect(byPhone.body.data.map((row: { id: string }) => row.id)).toEqual([b.id]);

    const byNumber = await client.get(`/api/v1/appointments?q=${b.recordNumber}`);
    expect(byNumber.body.data.map((row: { id: string }) => row.id)).toContain(b.id);

    const byTeam = await client.get("/api/v1/appointments?team=team%20a");
    expect(byTeam.body.data.map((row: { id: string }) => row.id)).toEqual([a.id]);

    const byLocation = await client.get("/api/v1/appointments?location=Deira");
    expect(byLocation.body.data.map((row: { id: string }) => row.id)).toEqual([b.id]);

    const byStatus = await client.get("/api/v1/appointments?status=done");
    expect(byStatus.body.data.map((row: { id: string }) => row.id)).toEqual([a.id]);
  });

  it("paginates on the server and caps page size", async () => {
    const { client } = await createAndLogin();
    for (let i = 0; i < 3; i += 1) await createRecord(client, { appointmentLocal: `2026-10-12T0${i}:00` });

    const page = await client.get("/api/v1/appointments?pageSize=2&page=2");
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });

    expect((await client.get("/api/v1/appointments?pageSize=500")).status).toBe(400);
    expect((await client.get("/api/v1/appointments?sortBy=mobileNo")).status).toBe(400);
  });
});

describe("archive, restore and transactional audit history", () => {
  it("records create, update, archive and restore with the changed fields", async () => {
    const { client: admin } = await createAndLogin({ role: "SUPER_ADMIN", name: "Admin" });
    const { client: receptionist } = await createAndLogin({ name: "Reception" });

    const record = await createRecord(receptionist, { amount: "100" });
    const updated = await receptionist.put(
      `/api/v1/appointments/${record.id}`,
      toUpdatePayload(record, { amount: "150.25", status: "Seen", patientName: "Test Patient" }),
    );
    expect(updated.status).toBe(200);

    const archived = await admin.post(`/api/v1/admin/appointments/${record.id}/archive`, { version: 2 });
    expect(archived.status).toBe(200);
    expect(archived.body.data.archivedBy.name).toBe("Admin");

    // Archived records disappear for receptionists and cannot be edited.
    expect((await receptionist.get(`/api/v1/appointments/${record.id}`)).status).toBe(404);
    expect((await receptionist.get("/api/v1/appointments")).body.data).toHaveLength(0);
    expect(
      (await receptionist.put(`/api/v1/appointments/${record.id}`, toUpdatePayload(archived.body.data))).status,
    ).toBe(404);
    expect((await admin.get("/api/v1/appointments?archived=archived")).body.data).toHaveLength(1);

    const restored = await admin.post(`/api/v1/admin/appointments/${record.id}/restore`, { version: 3 });
    expect(restored.status).toBe(200);
    expect(restored.body.data.archivedAt).toBeNull();

    const history = await admin.get(`/api/v1/admin/appointments/${record.id}/history`);
    expect(history.status).toBe(200);
    const events = history.body.data.events;
    expect(events.map((event: { action: string }) => event.action)).toEqual(["CREATE", "UPDATE", "ARCHIVE", "RESTORE"]);
    expect(events.map((event: { version: number }) => event.version)).toEqual([1, 2, 3, 4]);
    expect(events[0].actor.name).toBe("Reception");
    expect(events[0].changes.amount).toEqual({ to: "100.00" });
    expect(events[1].changes).toEqual({
      amount: { from: "100.00", to: "150.25" },
      status: { from: null, to: "Seen" },
    });
    expect(events[2].actor.name).toBe("Admin");
  });

  it("rejects archive with a stale version", async () => {
    const { client: admin } = await createAndLogin({ role: "SUPER_ADMIN" });
    const record = await createRecord(admin);
    await admin.put(`/api/v1/appointments/${record.id}`, toUpdatePayload(record, { status: "x" }));
    const res = await admin.post(`/api/v1/admin/appointments/${record.id}/archive`, { version: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("VERSION_CONFLICT");
  });

  it("rolls back the record change when its audit entry cannot be written", async () => {
    const { client } = await createAndLogin();
    const record = await createRecord(client);
    const prisma = getPrisma();

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION test_block_audit() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'audit blocked for test'; END; $$ LANGUAGE plpgsql;`);
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER test_block_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION test_block_audit();`,
    );
    try {
      const update = await client.put(
        `/api/v1/appointments/${record.id}`,
        toUpdatePayload(record, { status: "Changed" }),
      );
      expect(update.status).toBe(500);
      expect(update.body.error).toEqual({ code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." });

      const create = await client.post("/api/v1/appointments", appointmentPayload());
      expect(create.status).toBe(500);
    } finally {
      await prisma.$executeRawUnsafe("DROP TRIGGER test_block_audit ON audit_events");
      await prisma.$executeRawUnsafe("DROP FUNCTION test_block_audit()");
    }

    const stored = await prisma.appointment.findUniqueOrThrow({ where: { id: record.id } });
    expect(stored.status).toBeNull();
    expect(stored.version).toBe(1);
    expect(await prisma.appointment.count()).toBe(1);
    expect(await prisma.auditEvent.count()).toBe(1);
  });
});
