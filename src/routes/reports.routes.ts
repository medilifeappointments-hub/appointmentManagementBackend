import { Router } from "express";
import * as controller from "../controllers/reports.controller.js";

/** Mounted behind requireRole("SUPER_ADMIN"). */
export function reportsRouter(): Router {
  const router = Router();

  router.get("/summary", controller.summary);

  return router;
}
