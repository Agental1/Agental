import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { csvResponse, toCsv } from "@/lib/admin/csv";

export const dynamic = "force-dynamic";

/** CSV of the email log, same filters as the page. Admins only, logged. */
export async function GET(req: Request) {
  const adminId = await currentAdminId();
  if (!adminId) return new Response("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  const status = (sp.get("status") ?? "").trim().slice(0, 20);
  const rows = await prisma.emailLog.findMany({
    where: { ...(q ? { OR: [{ to: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }, { kind: q }] } : {}), ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  await audit({ actorUserId: adminId, action: "admin.export.emails", resourceType: "Admin", resourceId: "*", after: { count: rows.length } });
  return csvResponse(
    toCsv(["created", "to", "subject", "kind", "status", "error", "resend_id", "last_event"], rows.map((r) => [r.createdAt, r.to, r.subject, r.kind, r.status, r.error ?? "", r.resendId ?? "", r.lastEventAt ?? ""])),
    "emails"
  );
}
