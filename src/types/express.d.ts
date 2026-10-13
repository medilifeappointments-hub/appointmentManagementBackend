import type { AuthContext } from "../models/auth.types.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by loadSession when a valid session cookie is present. */
      auth?: AuthContext;
    }
  }
}

export {};
