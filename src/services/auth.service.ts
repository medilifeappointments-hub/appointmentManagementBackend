import { getEnv } from "../config/env.js";
import { clinicToday } from "../utils/clinicTime.js";
import { ApiError } from "../utils/errors.js";
import { getDummyHash, hashPassword, verifyPassword } from "../utils/password.js";
import type { ChangePasswordInput, LoginInput } from "../models/auth.schemas.js";
import type { AuthContext, AuthUser } from "../models/auth.types.js";
import { createSession, csrfTokenFor } from "./session.service.js";
import * as repository from "../db/repositories/auth.repository.js";

const INVALID_LOGIN = "Invalid email or password.";

export interface SessionView {
  user: AuthUser;
  csrfToken: string;
  clinic: { timezone: string; today: string };
}

export function buildSessionView(auth: AuthContext): SessionView {
  const timezone = getEnv().CLINIC_TIMEZONE;
  return {
    user: auth.user,
    csrfToken: csrfTokenFor(auth.sessionId),
    clinic: { timezone, today: clinicToday(timezone) },
  };
}

/**
 * Verifies credentials and opens a new session. Unknown email, wrong password and
 * disabled accounts all produce the same generic error with similar timing.
 */
export async function login(input: LoginInput) {
  const user = await repository.findUserByEmail(input.email);

  const passwordOk = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), input.password);
  if (!user || !passwordOk || !user.isActive) {
    throw new ApiError(401, "INVALID_CREDENTIALS", INVALID_LOGIN);
  }

  const session = await createSession(user.id);
  const auth: AuthContext = {
    sessionId: session.sessionId,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  };
  return { token: session.token, expiresAt: session.expiresAt, view: buildSessionView(auth) };
}

/** Changes the caller's password, clears the forced-change flag and signs out other sessions. */
export async function changePassword(auth: AuthContext, input: ChangePasswordInput): Promise<SessionView> {
  const user = await repository.findUserById(auth.user.id);
  if (!user || !user.isActive) throw ApiError.unauthenticated();

  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw ApiError.validation([{ field: "currentPassword", message: "Current password is incorrect." }]);
  }

  const passwordHash = await hashPassword(input.newPassword);
  await repository.updatePasswordAndRevokeOtherSessions(user.id, passwordHash, auth.sessionId);

  return buildSessionView({ ...auth, user: { ...auth.user, mustChangePassword: false } });
}
