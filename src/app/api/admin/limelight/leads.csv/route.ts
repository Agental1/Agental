import { audit } from "@/lib/audit";
import { currentAdminId } from "@/lib/limelight/admin";
import { toCsv } from "@/lib/limelight/csv";
import { LEADS_MAX_LIMIT, listLimelightLeads } from "@/lib/limelight/leads";
import { LimelightLeadStatus } from "@/domain/limelight";

/**
 * GET /api/admin/limelight/leads.csv: every lead, for a spreadsheet.
 *
 * Admins only. Anyone else, signed in or not, gets the same 404 as a path
 * that does not exist. `?status=NEW|CONTACTED|CLOSED` narrows the export; an
 * unknown status is ignored.
 *
 * The file is UTF-8 with a byte order mark (Excel reads accents wrong
 * without one), a header row, RFC 4180 quoting and formula neutralizing
 * (src/lib/limelight/csv.ts). Each export writes one audit entry with the
 * number of rows; the rows themselves are not copied into the audit log.
 */

const COLUMNS = [
  "reference",
  "name",
  "email",
  "performerType",
  "portfolioUrl",
  "need",
  "contactPref",
  "phone",
  "source",
  "consentVersion",
  "marketingOptIn",
  "locale",
  "status",
  "submissions",
  "firstSeenAt",
  "lastSeenAt",
  "alert",
] as const;

export async function GET(req: Request) {
  const adminId = await currentAdminId();
  if (!adminId) return new Response("Not found", { status: 404 });

  const status = LimelightLeadStatus.safeParse(
    new URL(req.url).searchParams.get("status")
  );
  const leads = await listLimelightLeads({
    status: status.success ? status.data : undefined,
    limit: LEADS_MAX_LIMIT,
  });

  await audit({
    actorUserId: adminId,
    action: "limelight.leads.export",
    resourceType: "LimelightLead",
    resourceId: "csv",
    after: { rows: leads.length, status: status.success ? status.data : null },
  });

  const csv = toCsv([COLUMNS, ...leads.map((lead) => COLUMNS.map((column) => lead[column]))]);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${csv}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="limelight-leads-${day}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
