"use server";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { err, zodError, type ActionError } from "@/domain/action-result";
import { LimelightLeadInput } from "@/domain/limelight";

/**
 * Best-effort flood control: at most LIMIT submissions per visitor per window.
 * In memory, so each server instance counts on its own; it stops a script
 * hammering one instance, and the honeypot below catches most bots. Move to a
 * shared store (Upstash, Supabase) if the form ever draws real abuse.
 * The IP is used only as a counter key and never logged or forwarded.
 */
const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map<string, number[]>();

function overLimit(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return recent.length > LIMIT;
}

export type LimelightLeadState =
  | { ok: true; email: string }
  | { ok?: false; error?: ActionError }
  | undefined;

/**
 * "Start your site" on the Limelight page.
 *
 * The browser never talks to n8n. This action validates the lead, then
 * forwards it to the n8n workflow (W2, "contact lead") with an HMAC-SHA256
 * signature the workflow checks before trusting the payload.
 *
 * Abuse controls: a hidden honeypot field, a per-visitor submission limit,
 * length caps on every field (domain/limelight.ts), and Next's built-in
 * Origin check on server actions, which blocks cross-site form posts.
 *
 * Until both LIMELIGHT_LEADS_WEBHOOK_URL and N8N_SIGNING_SECRET are set, the
 * action runs in mock mode: it logs the lead on the server and reports
 * success, so the page can ship before the workflow exists. Nothing is sent
 * anywhere in mock mode.
 */
export async function submitLimelightLead(
  _prev: LimelightLeadState,
  formData: FormData
): Promise<LimelightLeadState> {
  // Honeypot: a field people never see. Bots fill it; we pretend it worked.
  if (String(formData.get("company") ?? "").length > 0) {
    return { ok: true, email: "" };
  }

  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    hdrs.get("x-real-ip") ??
    "unknown";
  if (overLimit(ip)) return { error: err("errors.limelightTooMany") };

  const parsed = LimelightLeadInput.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    discipline: formData.get("discipline"),
    need: formData.get("need"),
    budget: formData.get("budget"),
    contactPref: formData.get("contactPref"),
    phone: formData.get("phone") ?? "",
    message: formData.get("message") ?? "",
    locale: formData.get("locale") ?? "en",
  });
  if (!parsed.success) return { error: zodError(parsed.error) };

  const lead = { ...parsed.data, source: "limelight", receivedAt: new Date().toISOString() };
  const url = process.env.LIMELIGHT_LEADS_WEBHOOK_URL;
  const secret = process.env.N8N_SIGNING_SECRET;

  if (!url || !secret) {
    console.info("[limelight] mock mode, lead not forwarded:", {
      discipline: lead.discipline,
      need: lead.need,
      budget: lead.budget,
      locale: lead.locale,
    });
    return { ok: true, email: lead.email };
  }

  const body = JSON.stringify(lead);
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agental-signature": `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("[limelight] webhook refused the lead:", res.status);
      return { error: err("errors.limelightSendFailed") };
    }
  } catch (e) {
    console.error("[limelight] webhook unreachable:", e);
    return { error: err("errors.limelightSendFailed") };
  }
  return { ok: true, email: lead.email };
}
