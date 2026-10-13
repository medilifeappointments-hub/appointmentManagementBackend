import type { Request, Response } from "express";
import { sendData } from "../utils/http.js";
import { parse } from "../utils/validation.js";
import { reportRangeSchema } from "../models/reports.schemas.js";
import { getSummary } from "../services/reports.service.js";

export async function summary(req: Request, res: Response): Promise<void> {
  const range = parse(reportRangeSchema, req.query);
  sendData(res, await getSummary(range));
}
