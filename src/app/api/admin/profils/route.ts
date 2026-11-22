import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { profileFiltersFrom, listProfiles } from "@/lib/admin/views";
import { profilesCsv } from "@/lib/admin/view-csv";
import { csvResponse } from "@/lib/admin/csv";

export const dynamic = "force-dynamic";

/** CSV export of the admin profils view, same filters as the page. Admins only, logged. */
export async function GET(req: Request) {
  const adminId = await currentAdminId();
  if (!adminId) return new Response("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const rows = await listProfiles(profileFiltersFrom((k) => sp.get(k)));
  await audit({ actorUserId: adminId, action: "admin.export.profils", resourceType: "Admin", resourceId: "*", after: { count: rows.length } });
  return csvResponse(profilesCsv(rows), "profils");
}
