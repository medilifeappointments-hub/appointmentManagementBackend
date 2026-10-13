import type { Request, Response } from "express";
import { sendData } from "../utils/http.js";
import { parse, uuidParam } from "../utils/validation.js";
import { getAuth } from "../middlewares/auth.js";
import { createReceptionistSchema, resetPasswordSchema, setUserStatusSchema } from "../models/users.schemas.js";
import * as service from "../services/users.service.js";

export async function list(_req: Request, res: Response): Promise<void> {
  sendData(res, await service.listUsers());
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = parse(createReceptionistSchema, req.body);
  sendData(res, await service.createReceptionist(input), 201);
}

export async function setStatus(req: Request, res: Response): Promise<void> {
  const { id } = parse(uuidParam, req.params);
  const { isActive } = parse(setUserStatusSchema, req.body);
  sendData(res, await service.setUserActive(getAuth(req), id, isActive));
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { id } = parse(uuidParam, req.params);
  const { temporaryPassword } = parse(resetPasswordSchema, req.body);
  sendData(res, await service.resetReceptionistPassword(id, temporaryPassword));
}
