import type { Request, Response } from "express";
import { sendData, sendNoContent } from "../utils/http.js";
import { parse } from "../utils/validation.js";
import { getAuth } from "../middlewares/auth.js";
import { changePasswordSchema, loginSchema } from "../models/auth.schemas.js";
import * as service from "../services/auth.service.js";
import { clearSessionCookie, deleteSession, setSessionCookie } from "../services/session.service.js";

export async function login(req: Request, res: Response): Promise<void> {
  const input = parse(loginSchema, req.body);
  if (req.auth) await deleteSession(req.auth.sessionId);
  const result = await service.login(input);
  setSessionCookie(res, result.token, result.expiresAt);
  sendData(res, result.view);
}

export async function logout(req: Request, res: Response): Promise<void> {
  await deleteSession(getAuth(req).sessionId);
  clearSessionCookie(res);
  sendNoContent(res);
}

export function me(req: Request, res: Response): void {
  sendData(res, service.buildSessionView(getAuth(req)));
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const input = parse(changePasswordSchema, req.body);
  sendData(res, await service.changePassword(getAuth(req), input));
}
