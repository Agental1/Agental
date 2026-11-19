import { createHmac } from "node:crypto";
import { z } from "zod";

/**
 * Deals waiting for a talent's yes, held by the n8n workflow "Agental A"
 * (data table `tasks`, category `deal_pending_actor`).
 *
 * n8n never learns who a talent is (docs/ARCHITECTURE.md). Each talent is
 * known to it by an actor_ref: an HMAC of the profile id under
 * N8N_SIGNING_SECRET, stable, and meaningless without the secret. The site
 * asks for one actor_ref's deals and, in case the workflow ignores the
 * filter, keeps only rows tagged with that same ref. A deal without an
 * actor_ref is never shown to anyone.
 *
 * Configuration (all three, or the panel stays off):
 *   N8N_WEBHOOK_BASE_URL   e.g. https://agental.app.n8n.cloud/webhook
 *   N8N_WEBHOOK_AUTH_VALUE value of the workflow's Header Auth credential
 *   N8N_SIGNING_SECRET     derives actor_ref (shared with Limelight signing)
 * Optional: N8N_WEBHOOK_AUTH_HEADER (default "x-agental-key").
 */

export interface PendingDeal {
  taskId: string;
  task: string;
  terms: string;
  dealDocUrl: string | null;
  updatedAt: string | null;
}

export type DealsResult =
  | { status: "off" }
  | { status: "error" }
  | { status: "ok"; deals: PendingDeal[] };

const Row = z.object({
  task_id: z.union([z.string(), z.number()]).transform(String),
  task: z.string().nullish(),
  terms: z.string().nullish(),
  deal_doc_url: z.string().nullish(),
  updated_date: z.string().nullish(),
  actor_ref: z.string().nullish(),
});
const PendingResponse = z.object({ deals: z.array(Row) });

interface Config {
  base: string;
  header: string;
  value: string;
  secret: string;
}

function config(): Config | null {
  const base = process.env.N8N_WEBHOOK_BASE_URL?.replace(/\/+$/, "");
  const value = process.env.N8N_WEBHOOK_AUTH_VALUE;
  const secret = process.env.N8N_SIGNING_SECRET;
  if (!base || !value || !secret) return null;
  return {
    base,
    value,
    secret,
    header: process.env.N8N_WEBHOOK_AUTH_HEADER || "x-agental-key",
  };
}

/** The pseudonym n8n knows a talent by. Exported for tests and for n8n setup. */
export function actorRef(profileId: string, secret: string): string {
  return createHmac("sha256", secret).update(`actor:${profileId}`).digest("hex").slice(0, 32);
}

/** Keep only well-formed rows that belong to this actor. */
export function dealsForActor(payload: unknown, ref: string): PendingDeal[] | null {
  const parsed = PendingResponse.safeParse(payload);
  if (!parsed.success) return null;
  return parsed.data.deals
    .filter((d) => d.actor_ref === ref)
    .map((d) => ({
      taskId: d.task_id,
      task: d.task ?? "",
      terms: d.terms ?? "",
      dealDocUrl: d.deal_doc_url && /^https:\/\//.test(d.deal_doc_url) ? d.deal_doc_url : null,
      updatedAt: d.updated_date ?? null,
    }));
}

export async function listPendingDeals(profileId: string): Promise<DealsResult> {
  const cfg = config();
  if (!cfg) return { status: "off" };
  const ref = actorRef(profileId, cfg.secret);
  try {
    const res = await fetch(`${cfg.base}/deals/pending?actor_ref=${ref}`, {
      headers: { [cfg.header]: cfg.value },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("[deals] pending refused:", res.status);
      return { status: "error" };
    }
    const deals = dealsForActor(await res.json(), ref);
    return deals ? { status: "ok", deals } : { status: "error" };
  } catch (e) {
    console.error("[deals] pending unreachable:", e);
    return { status: "error" };
  }
}

export type DecisionOutcome = "ok" | "off" | "not_found" | "error";

/**
 * Send the talent's answer. Re-reads the talent's own deals first, so a
 * forged task_id for someone else's deal is refused here, before n8n.
 */
export async function sendDealDecision(
  profileId: string,
  taskId: string,
  decision: "accept" | "deny",
  comment: string
): Promise<DecisionOutcome> {
  const cfg = config();
  if (!cfg) return "off";
  const mine = await listPendingDeals(profileId);
  if (mine.status !== "ok") return "error";
  if (!mine.deals.some((d) => d.taskId === taskId)) return "not_found";

  try {
    const res = await fetch(`${cfg.base}/deals/decision`, {
      method: "POST",
      headers: { "content-type": "application/json", [cfg.header]: cfg.value },
      body: JSON.stringify({
        task_id: taskId,
        decision,
        comment,
        actor_ref: actorRef(profileId, cfg.secret),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("[deals] decision refused:", res.status);
      return "error";
    }
    const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return body?.ok ? "ok" : "not_found";
  } catch (e) {
    console.error("[deals] decision unreachable:", e);
    return "error";
  }
}
