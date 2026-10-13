import { randomUUID } from "node:crypto";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../src/app.js";
import type { Role } from "../../src/generated/prisma/client.js";
import { hashPassword } from "../../src/utils/password.js";
import { getPrisma } from "../../src/db/prisma.js";

export const TEST_PASSWORD = "correct-horse-battery";

let app: Express | undefined;
export const getApp = () => (app ??= createApp());

export async function resetDatabase() {
  await getPrisma().$executeRawUnsafe(
    'TRUNCATE TABLE "audit_events", "appointments", "sessions", "users" RESTART IDENTITY CASCADE',
  );
}

let userCounter = 0;
export async function createUser(
  options: {
    role?: Role;
    name?: string;
    email?: string;
    password?: string;
    isActive?: boolean;
    mustChangePassword?: boolean;
  } = {},
) {
  userCounter += 1;
  return getPrisma().user.create({
    data: {
      name: options.name ?? `User ${userCounter}`,
      email: options.email ?? `user${userCounter}@clinic.test`,
      passwordHash: await hashPassword(options.password ?? TEST_PASSWORD),
      role: options.role ?? "RECEPTIONIST",
      isActive: options.isActive ?? true,
      mustChangePassword: options.mustChangePassword ?? false,
    },
  });
}

/** A signed-in browser: keeps the session cookie and sends the CSRF header on mutations. */
export class TestClient {
  constructor(
    readonly agent: ReturnType<typeof request.agent>,
    public csrfToken: string,
  ) {}

  get(path: string) {
    return this.agent.get(path);
  }
  post(path: string, body?: object) {
    return this.agent.post(path).set("X-CSRF-Token", this.csrfToken).send(body);
  }
  put(path: string, body?: object) {
    return this.agent.put(path).set("X-CSRF-Token", this.csrfToken).send(body);
  }
  patch(path: string, body?: object) {
    return this.agent.patch(path).set("X-CSRF-Token", this.csrfToken).send(body);
  }
}

export async function login(email: string, password = TEST_PASSWORD): Promise<TestClient> {
  const agent = request.agent(getApp());
  const res = await agent.post("/api/v1/auth/login").send({ email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return new TestClient(agent, res.body.data.csrfToken);
}

export async function createAndLogin(options: Parameters<typeof createUser>[0] = {}) {
  const user = await createUser(options);
  const client = await login(user.email, options.password ?? TEST_PASSWORD);
  return { user, client };
}

export function appointmentPayload(overrides: Record<string, unknown> = {}) {
  return {
    submissionKey: randomUUID(),
    clinicNumber: "+971523452646",
    patientType: "NEW",
    cs: "",
    team: "SHIM/ZUBAIR",
    mobileNo: "+971 50 123 4567",
    patientName: "Test Patient",
    location: "Dubai Marina",
    appointmentLocal: "2026-10-12T10:30",
    procedure: "Consultation",
    amount: "",
    resultIssued: "",
    cost: "",
    paymentMethod: "",
    status: "",
    approvalCode: "",
    ...overrides,
  };
}

/** Fields of a returned appointment that can be sent back in an update. */
export function toUpdatePayload(appointment: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  const keys = [
    "clinicNumber",
    "patientType",
    "cs",
    "team",
    "mobileNo",
    "patientName",
    "location",
    "appointmentLocal",
    "procedure",
    "amount",
    "resultIssued",
    "cost",
    "paymentMethod",
    "status",
    "approvalCode",
    "version",
  ];
  return { ...Object.fromEntries(keys.map((key) => [key, appointment[key]])), ...overrides };
}
