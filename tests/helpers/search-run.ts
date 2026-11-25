import { prisma } from "@/lib/db";

/**
 * Round 11.1: "Run searches" is off by default and the n8n claim hands out
 * nothing while it is. Tests of the claim route turn it on, then put back
 * whatever was stored.
 */
const KEY = "search.run";

export async function turnSearchesOn(): Promise<() => Promise<void>> {
  const saved = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const value = JSON.stringify({ running: true, since: new Date().toISOString() });
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  return async () => {
    await prisma.appSetting.deleteMany({ where: { key: KEY } });
    if (saved) await prisma.appSetting.create({ data: { key: saved.key, value: saved.value, updatedById: saved.updatedById } });
  };
}
