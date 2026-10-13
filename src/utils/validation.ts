import { z } from "zod";
import { ApiError, type FieldIssue } from "./errors.js";
import { MONEY_PATTERN } from "./money.js";

/** Parses input against a schema, converting failures into a 400 with per-field issues. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw ApiError.validation(toFieldIssues(result.error));
  return result.data;
}

export function toFieldIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}

/** Blank strings and whitespace become null; other strings are trimmed. */
const blankToNull = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

export const requiredText = (max: number, label: string) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be at most ${max} characters.`);

/** Optional text: missing, null or blank → null. */
export const optionalText = (max: number, label: string) =>
  z.preprocess(
    blankToNull,
    z
      .string({ error: `${label} must be text.` })
      .max(max, `${label} must be at most ${max} characters.`)
      .nullish()
      .transform((value) => value ?? null),
  );

/** Optional non-negative money as a decimal string: missing/blank → null (unknown); "0" is an entered zero. */
export const optionalMoney = (label: string) =>
  z.preprocess(
    blankToNull,
    z
      .string({ error: `${label} must be sent as a decimal string.` })
      .regex(MONEY_PATTERN, `${label} must be a non-negative amount with at most 2 decimal places.`)
      .nullish()
      .transform((value) => value ?? null),
  );

export const optionalEnum = <const T extends readonly [string, ...string[]]>(values: T, label: string) =>
  z.preprocess(
    blankToNull,
    z
      .enum(values, { error: `${label} must be one of: ${values.join(", ")}.` })
      .nullish()
      .transform((value) => value ?? null),
  );

/** Phone number input shared by patient and clinic-number modules. */
export const phoneNumberSchema = (label: string) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(30, `${label} is too long.`)
    .transform((value) => value.replace(/[\s\-().]/g, ""))
    .pipe(
      z
        .string()
        .regex(
          /^\+?\d{6,15}$/,
          `Enter a valid ${label.toLowerCase()}: 6–15 digits, optionally starting with + and country code.`,
        ),
    );

export const emailSchema = z
  .string({ error: "Email is required." })
  .trim()
  .toLowerCase()
  .max(254, "Email is too long.")
  .pipe(z.email({ error: "Enter a valid email address." }));

/** Length-based policy (NIST 800-63B); max bounds hashing cost. */
export const newPasswordSchema = z
  .string({ error: "Password is required." })
  .min(10, "Password must be at least 10 characters.")
  .max(128, "Password must be at most 128 characters.");

export const uuidParam = z.object({ id: z.uuid({ error: "Invalid id." }) });
