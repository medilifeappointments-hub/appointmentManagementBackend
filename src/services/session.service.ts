import type { CookieOptions, Request, Response } from "express";
import { getEnv, isProduction } from "../config/env.js";
import type { Prisma } from "../generated/prisma/client.js";
import { generateToken, hmacBase64Url, sha256Hex } from "../utils/crypto.js";
import type { AuthContext } from "../models/auth.types.js";
import * as repository from "../db/repositories/session.repository.js";

/** Avoid a write on every request: refresh lastSeenAt at most once per minute. */
const TOUCH_INTERVAL_MS = 60_000;

/** The "__Host-" prefix pins the cookie to this exact origin (requires Secure, Path=/, no Domain). */
export const sessionCookieName = () => (isProduction() ? "__Host-clinic_sid" : "clinic_sid");

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "strict",
    path: "/",
  };
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(sessionCookieName(), token, { ...cookieOptions(), expires: expiresAt });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(sessionCookieName(), cookieOptions());
}

export function readSessionToken(req: Request): string | undefined {
  const value: unknown = req.cookies?.[sessionCookieName()];
  return typeof value === "string" && value.length > 0 && value.length <= 128 ? value : undefined;
}

/** CSRF token bound to the session: only the server (holding CSRF_SECRET) can derive it. */
export function csrfTokenFor(sessionId: string): string {
  return hmacBase64Url(getEnv().CSRF_SECRET, `csrf:${sessionId}`);
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + getEnv().SESSION_TTL_HOURS * 3_600_000);
  const session = await repository.create(userId, sha256Hex(token), expiresAt);
  return { token, expiresAt, sessionId: session.id };
}

/** Resolves a raw cookie token to a live session, enforcing absolute and idle expiry. */
export async function resolveSession(token: string): Promise<AuthContext | null> {
  const session = await repository.findByTokenHash(sha256Hex(token));
  if (!session) return null;

  const now = Date.now();
  const idleLimitMs = getEnv().SESSION_IDLE_MINUTES * 60_000;
  const expired = session.expiresAt.getTime() <= now || now - session.lastSeenAt.getTime() > idleLimitMs;
  if (expired || !session.user.isActive) {
    await repository.deleteById(session.id);
    return null;
  }

  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await repository.touch(session.id, new Date(now));
  }

  const { user } = session;
  return {
    sessionId: session.id,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  };
}

export async function deleteSession(sessionId: string): Promise<void> {
  await repository.deleteById(sessionId);
}

/** Revokes every session of a user (optionally keeping one). Accepts a transaction client. */
export async function revokeUserSessions(
  db: Prisma.TransactionClient,
  userId: string,
  exceptSessionId?: string,
): Promise<number> {
  const result = await db.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
  return result.count;
}

export async function purgeExpiredSessions(): Promise<number> {
  const result = await repository.deleteExpired(new Date());
  return result.count;
}
