import { z } from "zod";
import { isValidLocalDate } from "../utils/clinicTime.js";

const localDate = (label: string) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .refine((value) => isValidLocalDate(value), `${label} must be a valid date (YYYY-MM-DD).`);

export const reportRangeSchema = z
  .object({ from: localDate("From date"), to: localDate("To date") })
  .refine((value) => value.from <= value.to, { path: ["to"], message: "To date must be on or after From date." });

export type ReportRange = z.infer<typeof reportRangeSchema>;
