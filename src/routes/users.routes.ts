import { Router } from "express";
import { createSensitiveLimiter } from "../middlewares/rateLimit.js";
import * as controller from "../controllers/users.controller.js";

/** Mounted behind requireRole("SUPER_ADMIN"). */
export function usersRouter(): Router {
  const router = Router();
  const sensitive = createSensitiveLimiter();

  router.get("/", controller.list);
  router.post("/", sensitive, controller.create);
  router.patch("/:id/status", sensitive, controller.setStatus);
  router.post("/:id/reset-password", sensitive, controller.resetPassword);

  return router;
}
