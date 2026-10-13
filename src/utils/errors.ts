/** Machine-readable error codes returned to the client. */
export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "PASSWORD_CHANGE_REQUIRED"
  | "FORBIDDEN"
  | "CSRF_INVALID"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export interface FieldIssue {
  field: string;
  message: string;
}

/** Expected, client-facing error. Anything else becomes a generic 500. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }
  static validation(issues: FieldIssue[]) {
    return new ApiError(400, "VALIDATION_ERROR", "Some fields are invalid.", { issues });
  }
  static unauthenticated(message = "Please sign in to continue.") {
    return new ApiError(401, "UNAUTHENTICATED", message);
  }
  static forbidden(message = "You do not have permission to perform this action.") {
    return new ApiError(403, "FORBIDDEN", message);
  }
  static notFound(message = "The requested resource was not found.") {
    return new ApiError(404, "NOT_FOUND", message);
  }
  static conflict(message: string, details?: unknown) {
    return new ApiError(409, "CONFLICT", message, details);
  }
}
