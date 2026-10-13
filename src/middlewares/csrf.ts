import type { RequestHandler } from "express";
import { getEnv } from "../config/env.js";
import { safeEqual } from "../utils/crypto.js";
import { ApiError } from "../utils/errors.js";
import { csrfTokenFor } from "../services/session.service.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const CSRF_HEADER = "x-csrf-token";

/**
 * Two layers for state-changing requests:
 *  1. Origin check: a browser-sent Origin must match the request host or an allowlisted origin.
 *  2. Authenticated requests must carry the session-bound CSRF token in X-CSRF-Token.
 * Together with SameSite=Strict cookies this blocks cross-site request forgery,
 * including login CSRF.
 */
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get("origin");
  if (origin && !isAllowedOrigin(origin, req.get("host"))) {
    throw new ApiError(403, "CSRF_INVALID", "Request origin is not allowed.");
  }

  if (req.auth) {
    const provided = req.get(CSRF_HEADER);
    if (!provided || !safeEqual(provided, csrfTokenFor(req.auth.sessionId))) {
      throw new ApiError(
        403,
        "CSRF_INVALID",
        "Your security token is missing or out of date. Reload the page and try again.",
      );
    }
  }
  next();
};

function isAllowedOrigin(origin: string, host: string | undefined): boolean {
  if (getEnv().CORS_ORIGINS.includes(origin)) return true;
  try {
    return host !== undefined && new URL(origin).host === host;
  } catch {
    return false;
  }
}
