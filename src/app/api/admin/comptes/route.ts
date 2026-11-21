import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { accountsCsv, listAccounts } from "@/lib/admin/accounts";

export const dynamic = "force-dynamic";

/** CSV export of the accounts list, same filters as the page. Admins only, logged. */
export async function GET(req: Request) {
  const adminId = await currentAdminId();
  if (!adminId) return new Response("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const audience = sp.get("audience");
  const method = sp.get("method");
  const verified = sp.get("verified");
  const plan = sp.get("plan");
  const rows = await listAccounts(
    {
      q: sp.get("q")?.slice(0, 100) || undefined,
      audience: audience === "TALENT" || audience === "CASTING" ? audience : undefined,
      plan: plan && ["FREE", "PRO", "PREMIUM", "ULTIMATE"].includes(plan) ? plan : undefined,
      method: method === "email" || method === "google" ? method : undefined,
      verified: verified === "yes" || verified === "no" ? verified : undefined,
    },
    5000
  );
  await audit({ actorUserId: adminId, action: "admin.export.accounts", resourceType: "User", resourceId: "*", after: { count: rows.length } });
  return new Response(accountsCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agental-accounts-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
