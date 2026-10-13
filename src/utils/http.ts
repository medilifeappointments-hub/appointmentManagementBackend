import type { Response } from "express";

/**
 * Response envelope used by every endpoint:
 *   success: { data, meta? }
 *   error:   { error: { code, message, details? } }   (see middlewares/errorHandler.ts)
 */
export function sendData<T>(res: Response, data: T, status = 200, meta?: Record<string, unknown>) {
  res.status(status).json(meta ? { data, meta } : { data });
}

export function sendNoContent(res: Response) {
  res.status(204).end();
}

export interface PageMeta extends Record<string, unknown> {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function pageMeta(page: number, pageSize: number, total: number): PageMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
