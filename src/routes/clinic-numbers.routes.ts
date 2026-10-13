import { Router } from "express";
import * as controller from "../controllers/clinic-numbers.controller.js";

export function clinicNumbersRouter(): Router {
  const router = Router();

  router.get("/", controller.list);
  router.post("/", controller.create);

  return router;
}
