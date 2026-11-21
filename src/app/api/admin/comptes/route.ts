import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { accountFiltersFrom, accountsCsv, listAccounts } from "@/lib/admin/accounts";

export const dynamic = "force-dynamic";

/** CSV export of the accounts list, same filters as the page. Admins only, logged. */
export async function GET(req: Request) {
  const adminId = await currentAdminId();
  if (!adminId) return new Response("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const rows = await listAccounts(accountFiltersFrom((k) => sp.get(k)));
  await audit({ actorUserId: adminId, action: "admin.export.accounts", resourceType: "User", resourceId: "*", after: { count: rows.length } });
  return new Response(accountsCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agental-accounts-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
