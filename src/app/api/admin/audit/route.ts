import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { auditFiltersFrom, listAudit } from "@/lib/admin/views";
import { auditCsv } from "@/lib/admin/view-csv";
import { csvResponse } from "@/lib/admin/csv";

export const dynamic = "force-dynamic";

/** CSV export of the admin audit view, same filters as the page. Admins only, logged. */
export async function GET(req: Request) {
  const adminId = await currentAdminId();
  if (!adminId) return new Response("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const rows = await listAudit(auditFiltersFrom((k) => sp.get(k)));
  await audit({ actorUserId: adminId, action: "admin.export.audit", resourceType: "Admin", resourceId: "*", after: { count: rows.length } });
  return csvResponse(auditCsv(rows), "audit");
}
