import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { createLoginLimiter, createSensitiveLimiter } from "../middlewares/rateLimit.js";
import * as controller from "../controllers/auth.controller.js";

export function authRouter(): Router {
  const router = Router();
  const signedIn = requireAuth({ allowPendingPasswordChange: true });

  router.post("/login", createLoginLimiter(), controller.login);
  router.post("/logout", signedIn, controller.logout);
  router.get("/me", signedIn, controller.me);
  router.post("/password", signedIn, createSensitiveLimiter(), controller.changePassword);

  return router;
}
