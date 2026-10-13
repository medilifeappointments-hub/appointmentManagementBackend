import type { Role } from "../generated/prisma/client.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface AuthContext {
  user: AuthUser;
  sessionId: string;
}
