import { getEnv } from "../config/env.js";

type Level = "debug" | "info" | "warn" | "error";

/**
 * Minimal structured logger. Callers must only pass non-sensitive fields:
 * never passwords, cookies, tokens, connection strings, patient data or request bodies.
 */
function write(level: Level, message: string, fields?: Record<string, unknown>) {
  if (getEnv().NODE_ENV === "test" && level !== "error") return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => write("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("error", message, fields),
};
