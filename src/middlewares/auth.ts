import type { Request, RequestHandler } from "express";
import type { Role } from "../generated/prisma/client.js";
import { ApiError } from "../utils/errors.js";
import type { AuthContext } from "../models/auth.types.js";

interface RequireAuthOptions {
  /** Allow access while the user still has to change an admin-reset password. */
  allowPendingPasswordChange?: boolean;
}

export function requireAuth(options: RequireAuthOptions = {}): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw ApiError.unauthenticated();
    if (req.auth.user.mustChangePassword && !options.allowPendingPasswordChange) {
      throw new ApiError(403, "PASSWORD_CHANGE_REQUIRED", "You must change your password before continuing.");
    }
    next();
  };
}

/** Must run after requireAuth. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth || !roles.includes(req.auth.user.role)) throw ApiError.forbidden();
    next();
  };
}

/** Acting user for handlers behind requireAuth. Identity always comes from the session. */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw ApiError.unauthenticated();
  return req.auth;
}
