import { getPrisma } from "../prisma.js";

export async function findAll(): Promise<string[]> {
  const rows = await getPrisma().clinicNumber.findMany({
    orderBy: { createdAt: "asc" },
    select: { number: true },
  });
  return rows.map((row) => row.number);
}

export async function exists(number: string): Promise<boolean> {
  return Boolean(await getPrisma().clinicNumber.findUnique({ where: { number }, select: { id: true } }));
}

export async function upsert(number: string): Promise<string> {
  const row = await getPrisma().clinicNumber.upsert({
    where: { number },
    create: { number },
    update: {},
    select: { number: true },
  });
  return row.number;
}
