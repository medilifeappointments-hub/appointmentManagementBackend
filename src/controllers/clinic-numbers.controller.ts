import type { Request, Response } from "express";
import { sendData } from "../utils/http.js";
import { parse } from "../utils/validation.js";
import { createClinicNumberSchema } from "../models/clinic-numbers.schemas.js";
import * as service from "../services/clinic-numbers.service.js";

export async function list(_req: Request, res: Response): Promise<void> {
  sendData(res, await service.listClinicNumbers());
}

export async function create(req: Request, res: Response): Promise<void> {
  const { number } = parse(createClinicNumberSchema, req.body);
  sendData(res, { number: await service.addClinicNumber(number) }, 201);
}
