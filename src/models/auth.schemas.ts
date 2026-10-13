import { z } from "zod";
import { emailSchema, newPasswordSchema } from "../utils/validation.js";

export const loginSchema = z.strictObject({
  email: emailSchema,
  // Not policy-checked here: only bounded, so legacy passwords can still sign in.
  password: z.string({ error: "Password is required." }).min(1, "Password is required.").max(128),
});

export const changePasswordSchema = z
  .strictObject({
    currentPassword: z.string({ error: "Current password is required." }).min(1).max(128),
    newPassword: newPasswordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ["newPassword"],
    message: "New password must be different from the current password.",
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
