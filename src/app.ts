import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Router, type Express } from "express";
import helmet from "helmet";
import { getEnv } from "./config/env.js";
import { requireAuth, requireRole } from "./middlewares/auth.js";
import { csrfProtection } from "./middlewares/csrf.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import { requestLogger } from "./middlewares/requestLogger.js";
import { loadSession } from "./middlewares/session.js";
import { adminAppointmentsRouter, appointmentsRouter } from "./routes/appointments.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { clinicNumbersRouter } from "./routes/clinic-numbers.routes.js";
import { reportsRouter } from "./routes/reports.routes.js";
import { usersRouter } from "./routes/users.routes.js";

export function createApp(): Express {
  const env = getEnv();
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);
  // The SPA is served separately; the API only returns JSON.
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } }));
  app.use(
    cors({
      origin: env.CORS_ORIGINS, // explicit allowlist, never "*"
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH"],
      allowedHeaders: ["Content-Type", "X-CSRF-Token"],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ data: { status: "ok" } });
  });

  const api = Router();
  api.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  api.use(loadSession);
  api.use(requestLogger);
  api.use(csrfProtection);

  api.use("/auth", authRouter());
  api.use("/appointments", requireAuth(), appointmentsRouter());
  api.use("/clinic-numbers", requireAuth(), clinicNumbersRouter());

  const admin = Router();
  admin.use(requireAuth(), requireRole("SUPER_ADMIN"));
  admin.use("/appointments", adminAppointmentsRouter());
  admin.use("/reports", reportsRouter());
  admin.use("/users", usersRouter());
  api.use("/admin", admin);

  app.use("/api/v1", api);
  app.use("/api", notFoundHandler);
  app.use(errorHandler);

  return app;
}
