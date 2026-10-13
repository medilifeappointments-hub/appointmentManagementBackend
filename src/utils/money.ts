import { Prisma } from "../generated/prisma/client.js";

/**
 * Money is exchanged with the client as decimal strings ("1250.50") and stored as
 * NUMERIC(12,2), so no value ever passes through a binary float.
 * Up to 10 integer digits and at most 2 decimal places; negative values are rejected.
 */
export const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

export function toDecimal(value: string | null): Prisma.Decimal | null {
  return value === null ? null : new Prisma.Decimal(value);
}

export function formatMoney(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed(2);
}
