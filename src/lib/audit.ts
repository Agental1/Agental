import { prisma } from "@/lib/db";

/** Append an immutable audit entry. B2B neutrality/trace is a product feature. */
export async function audit(entry: {
  actorUserId?: string | null;
  organizationId?: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  before?: unknown;
  after?: unknown;
}) {
  await prisma.auditLog.create({
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
