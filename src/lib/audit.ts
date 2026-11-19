import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/**
 * Append an immutable audit entry. B2B neutrality/trace is a product feature.
 * Pass a transaction client to write the entry together with the change it
 * records, so neither can exist without the other.
 */
export async function audit(
  entry: {
    actorUserId?: string | null;
    organizationId?: string | null;
    action: string;
    resourceType: string;
    resourceId: string;
    before?: unknown;
    after?: unknown;
  },
  db: Pick<Prisma.TransactionClient, "auditLog"> = prisma
) {
  await db.auditLog.create({
    data: {
      actorUserId: entry.actorUserId ?? null,
      organizationId: entry.organizationId ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      before: JSON.stringify(entry.before ?? {}),
      after: JSON.stringify(entry.after ?? {}),
    },
  });
}
