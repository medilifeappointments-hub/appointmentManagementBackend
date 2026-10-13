import { Prisma, type User } from "../generated/prisma/client.js";
import { ApiError } from "../utils/errors.js";
import { hashPassword } from "../utils/password.js";
import type { AuthContext } from "../models/auth.types.js";
import { revokeUserSessions } from "./session.service.js";
import type { CreateUserInput } from "../models/users.schemas.js";
import * as repository from "../db/repositories/users.repository.js";

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: User["role"];
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function listUsers(): Promise<UserDto[]> {
  const users = await repository.findAll();
  return users.map(toUserDto);
}

/** Creates a staff account that must change its temporary password at first sign-in. */
export async function createUser(input: CreateUserInput): Promise<UserDto> {
  const passwordHash = await hashPassword(input.temporaryPassword);
  try {
    const user = await repository.createUser(input.name, input.email, passwordHash, input.role);
    return toUserDto(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw ApiError.validation([{ field: "email", message: "An account with this email already exists." }]);
    }
    throw error;
  }
}

/**
 * Enables or disables an account. Disabling revokes all of its sessions in the same
 * transaction, so the user is signed out immediately. Serializable isolation makes the
 * "last active super admin" guard safe against two admins disabling each other concurrently.
 */
export async function setUserActive(auth: AuthContext, userId: string, isActive: boolean): Promise<UserDto> {
  if (!isActive && userId === auth.user.id) {
    throw ApiError.conflict("You cannot disable your own account.");
  }

  try {
    const user = await repository.runSerializable(async (tx) => {
      const target = await repository.findById(tx, userId);
      if (!target) throw ApiError.notFound("User not found.");
      if (target.isActive === isActive) return target;

      if (!isActive && target.role === "SUPER_ADMIN") {
        const otherActiveAdmins = await repository.countOtherActiveAdmins(tx, target.id);
        if (otherActiveAdmins === 0) {
          throw ApiError.conflict("The last active super admin cannot be disabled.");
        }
      }

      const updated = await repository.updateActive(tx, userId, isActive);
      if (!isActive) await revokeUserSessions(tx, userId);
      return updated;
    });
    return toUserDto(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw ApiError.conflict("Another change was made at the same time. Please try again.");
    }
    throw error;
  }
}

/** Admin password reset for a receptionist: forces a change at next sign-in and signs them out. */
export async function resetReceptionistPassword(userId: string, temporaryPassword: string): Promise<UserDto> {
  const passwordHash = await hashPassword(temporaryPassword);
  const user = await repository.runTransaction(async (tx) => {
    const target = await repository.findById(tx, userId);
    if (!target) throw ApiError.notFound("User not found.");
    if (target.role !== "RECEPTIONIST") {
      throw ApiError.forbidden("Only receptionist passwords can be reset here.");
    }
    const updated = await repository.updateTemporaryPassword(tx, userId, passwordHash);
    await revokeUserSessions(tx, userId);
    return updated;
  });
  return toUserDto(user);
}
