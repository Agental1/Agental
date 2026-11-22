import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { deletionDays } from "@/domain/account-deletion";
import { deletionCsv, listDeletionCandidates } from "@/lib/admin/account-deletion";

export const dynamic = "force-dynamic";

/** CSV of the accounts eligible for deletion. Admins only, logged. */
export async function GET(req: Request) {
  const adminId = await currentAdminId();
  if (!adminId) return new Response("Not found", { status: 404 });
  const days = deletionDays(new URL(req.url).searchParams.get("days"), deletionDays(process.env.ACCOUNT_DELETION_AFTER_DAYS));
  const rows = await listDeletionCandidates(days);
  await audit({ actorUserId: adminId, action: "admin.export.deletion", resourceType: "User", resourceId: "*", after: { days, count: rows.length } });
  return new Response(deletionCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agental-deletion-candidates-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
