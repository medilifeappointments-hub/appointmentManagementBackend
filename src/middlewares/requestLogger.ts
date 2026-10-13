import type { RequestHandler } from "express";
import { logger } from "../utils/logger.js";

/**
 * Logs method, path (never the query string: it can contain patient search terms),
 * status, duration and acting user id. Never logs bodies, cookies or headers.
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  const started = performance.now();
  res.on("finish", () => {
    logger.info("request", {
      method: req.method,
      // originalUrl keeps the full mounted path; the query string is cut off.
      path: req.originalUrl.split("?")[0],
      status: res.statusCode,
      durationMs: Math.round(performance.now() - started),
      userId: req.auth?.user.id,
    });
  });
  next();
};
