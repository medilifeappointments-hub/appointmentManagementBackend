import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { disconnectPrisma, getPrisma } from "../src/db/prisma.js";
import {
  appointmentPayload,
  createAndLogin,
  createUser,
  getApp,
  login,
  resetDatabase,
  TEST_PASSWORD,
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

describe("authentication", () => {
  it("signs in with valid credentials and sets an HttpOnly, SameSite cookie", async () => {
    const user = await createUser({ email: "reception@clinic.test" });
    const res = await request(getApp())
      .post("/api/v1/auth/login")
      .send({ email: "  Reception@Clinic.TEST ", password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ id: user.id, role: "RECEPTIONIST" });
    expect(res.body.data.user).not.toHaveProperty("passwordHash");
    expect(res.body.data.csrfToken).toEqual(expect.any(String));
    expect(res.body.data.clinic.timezone).toBe("Asia/Dubai");
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  it("stores only a hash of the session token", async () => {
    await createUser({ email: "a@clinic.test" });
    const res = await request(getApp())
      .post("/api/v1/auth/login")
      .send({ email: "a@clinic.test", password: TEST_PASSWORD });
    const token = /clinic_sid=([^;]+)/.exec(String(res.headers["set-cookie"]))?.[1];
    const sessions = await getPrisma().session.findMany();
    expect(token).toBeTruthy();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.tokenHash).not.toContain(token!);
    expect(sessions[0]!.tokenHash).toHaveLength(64);
  });

  it("returns the same generic error for unknown email, wrong password and disabled account", async () => {
    await createUser({ email: "active@clinic.test" });
    await createUser({ email: "disabled@clinic.test", isActive: false });
    const app = getApp();

    const attempts = await Promise.all([
      request(app).post("/api/v1/auth/login").send({ email: "nobody@clinic.test", password: TEST_PASSWORD }),
      request(app).post("/api/v1/auth/login").send({ email: "active@clinic.test", password: "wrong-password!" }),
      request(app).post("/api/v1/auth/login").send({ email: "disabled@clinic.test", password: TEST_PASSWORD }),
    ]);
    for (const res of attempts) {
      expect(res.status).toBe(401);
      expect(res.body.error).toEqual({ code: "INVALID_CREDENTIALS", message: "Invalid email or password." });
    }
  });

  it("validates the login body", async () => {
    const res = await request(getApp()).post("/api/v1/auth/login").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const fields = res.body.error.details.issues.map((issue: { field: string }) => issue.field);
    expect(fields).toEqual(expect.arrayContaining(["email", "password"]));
  });

  it("requires authentication on every protected endpoint", async () => {
    const app = getApp();
    const responses = await Promise.all([
      request(app).get("/api/v1/auth/me"),
      request(app).get("/api/v1/appointments"),
      request(app).post("/api/v1/appointments").send(appointmentPayload()),
      request(app).get("/api/v1/admin/reports/summary?from=2026-10-01&to=2026-10-31"),
      request(app).get("/api/v1/admin/users"),
    ]);
    for (const res of responses) expect(res.status).toBe(401);
  });

  it("logs out and invalidates the session", async () => {
    const { client } = await createAndLogin();
    expect((await client.post("/api/v1/auth/logout")).status).toBe(204);
    expect((await client.get("/api/v1/auth/me")).status).toBe(401);
    expect(await getPrisma().session.count()).toBe(0);
  });
});

describe("CSRF protection", () => {
  it("rejects authenticated mutations without the CSRF token", async () => {
    const { client } = await createAndLogin();
    const res = await client.agent.post("/api/v1/appointments").send(appointmentPayload());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_INVALID");
  });

  it("rejects a token from another session", async () => {
    const { client: first } = await createAndLogin();
    const { client: second } = await createAndLogin();
    const res = await first.agent
      .post("/api/v1/appointments")
      .set("X-CSRF-Token", second.csrfToken)
      .send(appointmentPayload());
    expect(res.status).toBe(403);
  });

  it("rejects state-changing requests from a foreign origin, including login", async () => {
    await createUser({ email: "x@clinic.test" });
    const res = await request(getApp())
      .post("/api/v1/auth/login")
      .set("Origin", "https://evil.example")
      .send({ email: "x@clinic.test", password: TEST_PASSWORD });
    expect(res.status).toBe(403);
  });
});

describe("role restrictions", () => {
  it("blocks receptionists from every admin endpoint", async () => {
    const { client } = await createAndLogin({ role: "RECEPTIONIST" });
    const created = await client.post("/api/v1/appointments", appointmentPayload());
    const id = created.body.data.id as string;

    const responses = await Promise.all([
      client.get("/api/v1/admin/reports/summary?from=2026-10-01&to=2026-10-31"),
      client.get("/api/v1/admin/users"),
      client.post("/api/v1/admin/users", { name: "X", email: "x@clinic.test", temporaryPassword: "long-enough-pass" }),
      client.post(`/api/v1/admin/appointments/${id}/archive`, { version: 1 }),
      client.post(`/api/v1/admin/appointments/${id}/restore`, { version: 1 }),
      client.get(`/api/v1/admin/appointments/${id}/history`),
      client.get("/api/v1/appointments?archived=all"),
    ]);
    for (const res of responses) expect(res.status).toBe(403);
  });

  it("allows the super admin into admin endpoints", async () => {
    const { client } = await createAndLogin({ role: "SUPER_ADMIN" });
    expect((await client.get("/api/v1/admin/users")).status).toBe(200);
    expect((await client.get("/api/v1/admin/reports/summary?from=2026-10-01&to=2026-10-31")).status).toBe(200);
  });
});

describe("user management", () => {
  it("creates receptionists who must change their temporary password first", async () => {
    const { client: admin } = await createAndLogin({ role: "SUPER_ADMIN" });
    const created = await admin.post("/api/v1/admin/users", {
      name: "Sara",
      email: "Sara@Clinic.test",
      temporaryPassword: "temporary-pass-1",
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      email: "sara@clinic.test",
      role: "RECEPTIONIST",
      mustChangePassword: true,
    });

    const sara = await login("sara@clinic.test", "temporary-pass-1");
    const blocked = await sara.get("/api/v1/appointments");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect((await sara.get("/api/v1/auth/me")).status).toBe(200);

    const changed = await sara.post("/api/v1/auth/password", {
      currentPassword: "temporary-pass-1",
      newPassword: "my-own-new-password",
    });
    expect(changed.status).toBe(200);
    expect(changed.body.data.user.mustChangePassword).toBe(false);
    expect((await sara.get("/api/v1/appointments")).status).toBe(200);
  });

  it("rejects duplicate emails", async () => {
    const { client: admin } = await createAndLogin({ role: "SUPER_ADMIN" });
    await createUser({ email: "dup@clinic.test" });
    const res = await admin.post("/api/v1/admin/users", {
      name: "Dup",
      email: "dup@clinic.test",
      temporaryPassword: "temporary-pass-1",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.issues[0].field).toBe("email");
  });

  it("revokes every session of a disabled account immediately", async () => {
    const { client: admin } = await createAndLogin({ role: "SUPER_ADMIN" });
    const { user, client: receptionist } = await createAndLogin({ role: "RECEPTIONIST" });
    const secondDevice = await login(user.email);
    expect((await receptionist.get("/api/v1/appointments")).status).toBe(200);

    const res = await admin.patch(`/api/v1/admin/users/${user.id}/status`, { isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);

    expect(await getPrisma().session.count({ where: { userId: user.id } })).toBe(0);
    expect((await receptionist.get("/api/v1/appointments")).status).toBe(401);
    expect((await secondDevice.get("/api/v1/auth/me")).status).toBe(401);
    await expect(login(user.email)).rejects.toThrow(/401/);
  });

  it("resets a receptionist password, revokes sessions and forces a change", async () => {
    const { client: admin } = await createAndLogin({ role: "SUPER_ADMIN" });
    const { user, client: receptionist } = await createAndLogin();

    const res = await admin.post(`/api/v1/admin/users/${user.id}/reset-password`, {
      temporaryPassword: "fresh-temp-pass",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.mustChangePassword).toBe(true);
    expect((await receptionist.get("/api/v1/auth/me")).status).toBe(401);
    await expect(login(user.email, TEST_PASSWORD)).rejects.toThrow(/401/);

    const relogged = await login(user.email, "fresh-temp-pass");
    expect((await relogged.get("/api/v1/appointments")).body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("cannot disable the last active super admin", async () => {
    const { user: admin, client } = await createAndLogin({ role: "SUPER_ADMIN" });
    const other = await createUser({ role: "SUPER_ADMIN", isActive: false });

    // Self-disable is refused outright.
    expect((await client.patch(`/api/v1/admin/users/${admin.id}/status`, { isActive: false })).status).toBe(409);

    // Re-enable the second admin, then disabling it again is fine because one admin remains.
    expect((await client.patch(`/api/v1/admin/users/${other.id}/status`, { isActive: true })).status).toBe(200);
    expect((await client.patch(`/api/v1/admin/users/${other.id}/status`, { isActive: false })).status).toBe(200);
  });

  it("keeps one active admin when two admins disable each other at the same time", async () => {
    const { user: firstUser, client: first } = await createAndLogin({ role: "SUPER_ADMIN" });
    const { user: secondUser, client: second } = await createAndLogin({ role: "SUPER_ADMIN" });

    const results = await Promise.all([
      first.patch(`/api/v1/admin/users/${secondUser.id}/status`, { isActive: false }),
      second.patch(`/api/v1/admin/users/${firstUser.id}/status`, { isActive: false }),
    ]);

    // Depending on timing the loser gets 409 (guard / serialization) or 401 (already signed out).
    expect(results.filter((res) => res.status === 200)).toHaveLength(1);
    expect(await getPrisma().user.count({ where: { role: "SUPER_ADMIN", isActive: true } })).toBe(1);
  });
});
