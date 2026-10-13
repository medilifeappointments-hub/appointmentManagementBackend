import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { isProduction } from "../config/env.js";
import { ApiError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { toFieldIssues } from "../utils/validation.js";

export const notFoundHandler: RequestHandler = () => {
  throw ApiError.notFound("API route not found.");
};

interface BodyParserError {
  type?: string;
}

/**
 * The single place that turns errors into the { error: { code, message, details? } } envelope.
 * Unexpected errors get a generic message; stack traces are never sent to clients and are
 * logged only outside production. Unknown error messages are not logged because ORM and
 * driver errors can embed query values (patient data).
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) return;

  let apiError: ApiError;
  if (err instanceof ApiError) {
    apiError = err;
  } else if (err instanceof ZodError) {
    apiError = ApiError.validation(toFieldIssues(err));
  } else if ((err as BodyParserError)?.type === "entity.too.large") {
    apiError = new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
  } else if ((err as BodyParserError)?.type === "entity.parse.failed") {
    apiError = ApiError.badRequest("Request body is not valid JSON.");
  } else {
    apiError = new ApiError(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
    const error = err as Error & { code?: unknown };
    logger.error("Unhandled error", {
      method: req.method,
      path: req.path,
      errorName: error?.name,
      errorCode: typeof error?.code === "string" ? error.code : undefined,
      ...(isProduction() ? {} : { stack: error?.stack }),
    });
  }

  const body: { code: string; message: string; details?: unknown } = {
    code: apiError.code,
    message: apiError.message,
  };
  if (apiError.details !== undefined) body.details = apiError.details;
  res.status(apiError.status).json({ error: body });
};
