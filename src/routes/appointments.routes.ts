import { Router } from "express";
import * as controller from "../controllers/appointments.controller.js";

/** Shared data-entry endpoints for every signed-in staff member. */
export function appointmentsRouter(): Router {
  const router = Router();

  router.get("/", controller.list);
  router.get("/filter-options", controller.filterOptions);
  router.get("/:id", controller.getById);
  router.post("/", controller.create);
  router.put("/:id", controller.update);

  return router;
}

/** Super-admin-only record administration. Mounted behind requireRole("SUPER_ADMIN"). */
export function adminAppointmentsRouter(): Router {
  const router = Router();

  router.post("/:id/archive", controller.archive);
  router.post("/:id/restore", controller.restore);
  router.get("/:id/history", controller.history);

  return router;
}
