import { rateLimit } from "express-rate-limit";
import { getEnv } from "../config/env.js";
import { ApiError } from "../utils/errors.js";

const WINDOW_MS = 15 * 60_000;

const reject = (message: string) => () => {
  throw new ApiError(429, "RATE_LIMITED", message);
};

/** Failed sign-in attempts per IP. Successful sign-ins do not count. */
export const createLoginLimiter = () =>
  rateLimit({
    windowMs: WINDOW_MS,
    limit: getEnv().LOGIN_RATE_LIMIT_MAX,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: reject("Too many sign-in attempts. Please wait a few minutes and try again."),
  });

/** Password changes and account administration, per IP. */
export const createSensitiveLimiter = () =>
  rateLimit({
    windowMs: WINDOW_MS,
    limit: getEnv().SENSITIVE_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: reject("Too many requests. Please wait a few minutes and try again."),
  });
