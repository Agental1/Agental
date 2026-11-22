import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { mediaFiltersFrom, listMedia } from "@/lib/admin/views";
import { mediaCsv } from "@/lib/admin/view-csv";
import { csvResponse } from "@/lib/admin/csv";

export const dynamic = "force-dynamic";

/** CSV export of the admin medias view, same filters as the page. Admins only, logged. */
export async function GET(req: Request) {
  const adminId = await currentAdminId();
  if (!adminId) return new Response("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const rows = await listMedia(mediaFiltersFrom((k) => sp.get(k)));
  await audit({ actorUserId: adminId, action: "admin.export.medias", resourceType: "Admin", resourceId: "*", after: { count: rows.length } });
  return csvResponse(mediaCsv(rows), "medias");
}
