import { z } from "zod";
import { emailSchema, newPasswordSchema, requiredText } from "../utils/validation.js";

export const createReceptionistSchema = z.strictObject({
  name: requiredText(100, "Name"),
  email: emailSchema,
  temporaryPassword: newPasswordSchema,
});

export const setUserStatusSchema = z.strictObject({
  isActive: z.boolean({ error: "isActive must be true or false." }),
});

export const resetPasswordSchema = z.strictObject({
  temporaryPassword: newPasswordSchema,
});

export type CreateReceptionistInput = z.infer<typeof createReceptionistSchema>;
