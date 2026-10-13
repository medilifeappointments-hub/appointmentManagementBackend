import type { Request, Response } from "express";
import { sendData } from "../utils/http.js";
import { parse, uuidParam } from "../utils/validation.js";
import { getAuth } from "../middlewares/auth.js";
import {
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  updateAppointmentSchema,
  versionSchema,
} from "../models/appointments.schemas.js";
import * as service from "../services/appointments.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  const query = parse(listAppointmentsQuerySchema, req.query);
  const { items, meta } = await service.listAppointments(getAuth(req), query);
  sendData(res, items, 200, meta);
}

export async function filterOptions(_req: Request, res: Response): Promise<void> {
  sendData(res, await service.getFilterOptions());
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = parse(uuidParam, req.params);
  sendData(res, await service.getAppointment(getAuth(req), id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = parse(createAppointmentSchema, req.body);
  const { appointment, replayed } = await service.createAppointment(getAuth(req), input);
  sendData(res, appointment, replayed ? 200 : 201, { replayed });
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = parse(uuidParam, req.params);
  const input = parse(updateAppointmentSchema, req.body);
  sendData(res, await service.updateAppointment(getAuth(req), id, input));
}

async function setArchived(req: Request, res: Response, archive: boolean): Promise<void> {
  const { id } = parse(uuidParam, req.params);
  const { version } = parse(versionSchema, req.body);
  sendData(res, await service.setArchived(getAuth(req), id, version, archive));
}

export const archive = (req: Request, res: Response) => setArchived(req, res, true);
export const restore = (req: Request, res: Response) => setArchived(req, res, false);

export async function history(req: Request, res: Response): Promise<void> {
  const { id } = parse(uuidParam, req.params);
  sendData(res, await service.getHistory(id));
}
