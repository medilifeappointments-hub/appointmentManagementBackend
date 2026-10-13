import { z } from "zod";

const isValidTimeZone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CLINIC_TIMEZONE: z
    .string()
    .default("Asia/Dubai")
    .refine(isValidTimeZone, "CLINIC_TIMEZONE must be a valid IANA timezone"),
  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .refine((origins) => !origins.includes("*"), "CORS_ORIGINS must not contain a wildcard"),
  CSRF_SECRET: z.string().min(32, "CSRF_SECRET must be at least 32 characters"),
  SESSION_TTL_HOURS: z.coerce.number().positive().max(72).default(12),
  SESSION_IDLE_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .max(24 * 60)
    .default(120),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  SENSITIVE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Validated environment. Parsed lazily so tests can set process.env first.
 * Error messages name the variable but never echo its value.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid server environment:\n${problems}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = (): boolean => getEnv().NODE_ENV === "production";
