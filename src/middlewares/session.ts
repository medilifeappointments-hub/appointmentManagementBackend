import type { RequestHandler } from "express";
import { clearSessionCookie, readSessionToken, resolveSession } from "../services/session.service.js";

/** Attaches req.auth when the session cookie maps to a live session of an active user. */
export const loadSession: RequestHandler = async (req, res, next) => {
  const token = readSessionToken(req);
  if (!token) return next();
  const auth = await resolveSession(token);
  if (auth) req.auth = auth;
  else clearSessionCookie(res);
  next();
};
