import { hash, verify, type Options } from "@node-rs/argon2";

/** `Algorithm.Argon2id` is an ambient const enum (unusable with isolatedModules); its value is 2. */
const ARGON2ID = 2 as NonNullable<Options["algorithm"]>;

// OWASP-recommended Argon2id parameters (m=19 MiB, t=2, p=1).
const ARGON2_OPTIONS: Options = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Verified against when the account does not exist, so login timing does not reveal it. */
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("timing-equaliser-not-a-real-password");
  return dummyHash;
}
