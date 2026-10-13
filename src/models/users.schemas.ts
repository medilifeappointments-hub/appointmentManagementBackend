import { z } from "zod";
import { emailSchema, newPasswordSchema, requiredText } from "../utils/validation.js";

export const createUserSchema = z.strictObject({
  name: requiredText(100, "Name"),
  email: emailSchema,
  temporaryPassword: newPasswordSchema,
  role: z
    .enum(["RECEPTIONIST", "SUPER_ADMIN"], { error: "Role must be Receptionist or Super Admin." })
    .default("RECEPTIONIST"),
});

export const setUserStatusSchema = z.strictObject({
  isActive: z.boolean({ error: "isActive must be true or false." }),
});

export const resetPasswordSchema = z.strictObject({
  temporaryPassword: newPasswordSchema,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
