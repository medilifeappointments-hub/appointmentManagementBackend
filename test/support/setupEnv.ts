import { inject } from "vitest";

// Runs before each test file is imported, so the lazily parsed env sees these values.
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: inject("databaseUrl"),
  CLINIC_TIMEZONE: "Asia/Dubai",
  CORS_ORIGINS: "http://localhost:5173",
  CSRF_SECRET: "test-csrf-secret-that-is-at-least-32-characters",
  SESSION_TTL_HOURS: "12",
  SESSION_IDLE_MINUTES: "120",
  LOGIN_RATE_LIMIT_MAX: "1000",
  SENSITIVE_RATE_LIMIT_MAX: "1000",
});
