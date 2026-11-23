import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { cookieFiltersFrom, cookiesCsv, listCookieChoices } from "@/lib/admin/cookies";

export const dynamic = "force-dynamic";

/** Round 10: CSV of the signed-in accounts' cookie choices, same filters as the page. Admins only, logged. */
export async function GET(req: Request) {
  const adminId = await currentAdminId();
  if (!adminId) return new Response("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const rows = await listCookieChoices(cookieFiltersFrom((k) => sp.get(k)));
  await audit({ actorUserId: adminId, action: "admin.export.cookies", resourceType: "User", resourceId: "*", after: { count: rows.length } });
  return new Response(cookiesCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agental-cookie-choices-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
