import { z } from "zod";
import { clinicLocalToInstant, isValidLocalDate, LOCAL_DATE_TIME_PATTERN } from "../utils/clinicTime.js";
import { optionalEnum, optionalMoney, optionalText, phoneNumberSchema, requiredText } from "../utils/validation.js";

export const FIELD_LIMITS = {
  cs: 50,
  team: 100,
  mobileNo: 20,
  patientName: 150,
  location: 150,
  procedure: 200,
  resultIssued: 100,
  status: 50,
  approvalCode: 50,
  search: 100,
} as const;

/**
 * Mobile numbers are kept as strings. Spaces, dashes, dots and parentheses are removed;
 * an optional leading "+" (country code) is preserved. 6–15 digits covers local and
 * international (E.164) numbers without assuming a country.
 */
const mobileNo = phoneNumberSchema("Mobile No");

/** Clinic-local "YYYY-MM-DDTHH:mm" → instant. */
const appointmentLocal = z
  .string({ error: "Appointment date and time is required." })
  .trim()
  .regex(LOCAL_DATE_TIME_PATTERN, "Appointment date and time is required (YYYY-MM-DDTHH:mm).")
  .transform((value, ctx) => {
    const instant = clinicLocalToInstant(value);
    if (!instant) {
      ctx.addIssue({ code: "custom", message: "This date and time does not exist in the clinic timezone." });
      return z.NEVER;
    }
    return instant;
  });

/**
 * The writable fields. strictObject rejects anything else (ids, audit columns,
 * createdById, version on create…), which prevents mass assignment.
 */
const appointmentFields = {
  clinicNumber: mobileNo,
  patientType: z.enum(["NEW", "OLD"], { error: "New/Old must be NEW or OLD." }),
  cs: optionalText(FIELD_LIMITS.cs, "C-S"),
  team: requiredText(FIELD_LIMITS.team, "Team"),
  mobileNo,
  patientName: requiredText(FIELD_LIMITS.patientName, "Patient Name"),
  location: optionalText(FIELD_LIMITS.location, "Location"),
  appointmentLocal,
  procedure: requiredText(FIELD_LIMITS.procedure, "Procedure"),
  amount: optionalMoney("Amount"),
  resultIssued: optionalText(FIELD_LIMITS.resultIssued, "Result Issued"),
  cost: optionalMoney("Cost"),
  paymentMethod: optionalEnum(["CASH", "CARD", "MIXED"], "Payment Method"),
  cashAmount: optionalMoney("Cash Amount"),
  cardAmount: optionalMoney("Card Amount"),
  status: optionalText(FIELD_LIMITS.status, "Status"),
  approvalCode: optionalText(FIELD_LIMITS.approvalCode, "Approval Code"),
};

const validatePaymentBreakdown = (
  value: {
    amount?: string | null;
    paymentMethod?: "CASH" | "CARD" | "MIXED" | null;
    cashAmount?: string | null;
    cardAmount?: string | null;
  },
  ctx: z.RefinementCtx,
) => {
  const cash = Number(value.cashAmount ?? 0);
  const card = Number(value.cardAmount ?? 0);
  const total = value.amount == null ? null : Number(value.amount);
  if (value.paymentMethod && total === null) {
    ctx.addIssue({
      code: "custom",
      path: ["amount"],
      message: "Amount is required when a payment method is selected.",
    });
  }
  if (value.paymentMethod === "MIXED" && (!(cash > 0) || !(card > 0))) {
    ctx.addIssue({
      code: "custom",
      path: [cash > 0 ? "cardAmount" : "cashAmount"],
      message: "Enter both cash and card amounts for a split payment.",
    });
  }
  if (value.paymentMethod && total !== null && Math.round((cash + card) * 100) !== Math.round(total * 100)) {
    ctx.addIssue({ code: "custom", path: ["amount"], message: "Cash Amount and Card Amount must add up to Amount." });
  }
};

export const createAppointmentSchema = z
  .strictObject({
    ...appointmentFields,
    submissionKey: z.uuid({ error: "A valid submission key is required." }),
  })
  .superRefine((value, ctx) => {
    const currentMinute = new Date();
    currentMinute.setSeconds(0, 0);
    if (value.appointmentLocal < currentMinute) {
      ctx.addIssue({
        code: "custom",
        path: ["appointmentLocal"],
        message: "Appointment date and time cannot be in the past.",
      });
    }
    validatePaymentBreakdown(value, ctx);
  });

export const updateAppointmentSchema = z
  .strictObject({
    ...appointmentFields,
    version: z.int({ error: "Record version is required." }).positive(),
  })
  .superRefine(validatePaymentBreakdown);

export const versionSchema = z.strictObject({
  version: z.int({ error: "Record version is required." }).positive(),
});

const localDate = (label: string) =>
  z
    .string()
    .trim()
    .refine((value) => isValidLocalDate(value), `${label} must be a valid date (YYYY-MM-DD).`);

const optionalFilter = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

export const SORT_FIELDS = ["appointmentAt", "recordNumber", "patientName", "createdAt", "updatedAt"] as const;
export const MAX_PAGE_SIZE = 100;

export const listAppointmentsQuerySchema = z
  .object({
    from: localDate("From date").optional(),
    to: localDate("To date").optional(),
    q: optionalFilter(FIELD_LIMITS.search),
    team: optionalFilter(FIELD_LIMITS.team),
    location: optionalFilter(FIELD_LIMITS.location),
    status: optionalFilter(FIELD_LIMITS.status),
    archived: z.enum(["active", "archived", "all"]).default("active"),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
    sortBy: z.enum(SORT_FIELDS).default("appointmentAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ["to"],
    message: "To date must be on or after From date.",
  });

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
export type AppointmentFieldsInput = Omit<CreateAppointmentInput, "submissionKey">;
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;
