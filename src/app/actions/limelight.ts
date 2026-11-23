"use server";

import { isVerifiedAdmin } from "@/lib/admin-mfa";
import { findPromotion } from "@/domain/pricing";
import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  err,
  zodError,
  type ActionError,
  type ErrorKey,
} from "@/domain/action-result";
import {
  LIMELIGHT,
  LIMELIGHT_DEFAULT_CONSENT_VERSION,
  LIMELIGHT_NEED_MAX_LENGTH,
  LimelightLeadInput,
  LimelightLeadStatus,
} from "@/domain/limelight";
import { changeLeadStatus, recordInterest } from "@/lib/limelight/leads";
import { scheduleOutboxDrain } from "@/lib/limelight/after-response";
import { clientAddressKey } from "@/lib/limelight/request";

/**
 * Limelight lead intake as server actions, and the owner's status change.
 *
 * Both form actions go through `recordInterest` (src/lib/limelight/leads.ts),
 * the same function as `POST /api/limelight/interest`: the lead is stored in
 * Postgres with its alert row in one transaction, and success is answered
 * only after that commit. Nothing is forwarded to n8n and nothing is "logged
 * instead of stored".
 *
 * Abuse controls: the hidden honeypot field, a limit per client address and
 * per email address kept in the database, length caps on every field, and
 * Next's Origin check on server actions, which blocks cross-site form posts.
 */

export type PortfolioRequestState =
  | { ok: true; reference: string }
  | {
      ok: false;
      error?: ActionError;
      /** One error key per form field name. */
      fieldErrors?: Record<string, ErrorKey>;
    }
  | undefined;

export type LimelightLeadState =
  | { ok: true; email: string }
  | { ok?: false; error?: ActionError }
  | undefined;

export type LeadStatusResult =
  | { ok: true; status: LimelightLeadStatus }
  | { ok: false; error: ActionError };

/** A text field of the form. A file or a missing field reads as absent. */
function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

/** A checkbox: present with any of the usual "on" values. */
function checked(formData: FormData, name: string): boolean {
  const value = field(formData, name)?.trim().toLowerCase();
  return value === "on" || value === "true" || value === "1" || value === "yes";
}

/**
 * "Request a portfolio site", as a form action for `useActionState`.
 *
 * Form fields: `name`, `email`, `performerType` (optional), `portfolioUrl`
 * (optional), `need` (optional), `contactPref` (optional, "email" or
 * "call"), `phone` (required when `contactPref` is "call", ignored
 * otherwise), `marketingOptIn` (checkbox, optional), `consentVersion`,
 * `source` (optional, "limelight-page" when absent), `locale` (optional) and
 * the honeypot `company`.
 *
 * `consentVersion` is the consent: make it the value of the required consent
 * checkbox, so an unticked box sends nothing and the answer is
 * `fieldErrors.consentVersion = "errors.consentRequired"`.
 */
export async function requestPortfolioSite(
  _prev: PortfolioRequestState,
  formData: FormData
): Promise<PortfolioRequestState> {
  const result = await recordInterest(
    {
      name: field(formData, "name"),
      email: field(formData, "email"),
      performerType: field(formData, "performerType"),
      portfolioUrl: field(formData, "portfolioUrl"),
      marketingOptIn: checked(formData, "marketingOptIn"),
      consentVersion: field(formData, "consentVersion"),
      source: field(formData, "source")?.trim() || "limelight-page",
      locale: field(formData, "locale"),
      need: field(formData, "need"),
      contactPref: field(formData, "contactPref"),
      phone: field(formData, "phone"),
      company: field(formData, "company"),
    },
    { clientKey: clientAddressKey(await headers()) }
  );

  if (result.ok) {
    if (result.created) scheduleOutboxDrain();
    return { ok: true, reference: result.reference };
  }
  if (result.reason === "invalid") {
    return { ok: false, fieldErrors: result.fieldErrors };
  }
  if (result.reason === "rate_limited") {
    return { ok: false, error: err("errors.limelightTooMany") };
  }
  return { ok: false, error: err("errors.limelightSendFailed") };
}

/**
 * "What they need" for the form on the page today, which asks it twice: a
 * choice (`need`) and a free message. Both are kept as one text, "choice:
 * message", when that fits the 500 characters the lead keeps. A longer
 * message is left out, and the caller says so in a log line.
 */
function needFromLegacyForm(
  choice: string,
  message: string
): { need: string; messageKept: boolean } {
  const text = message.replace(/\s+/g, " ").trim();
  if (!text) return { need: choice, messageKept: true };
  const both = `${choice}: ${text}`;
  return both.length <= LIMELIGHT_NEED_MAX_LENGTH
    ? { need: both, messageKept: true }
    : { need: choice, messageKept: false };
}

/**
 * The form on the Limelight page today ("Start your site"), with its field
 * names and its return type unchanged.
 *
 * It stores the lead through the same core as `requestPortfolioSite`:
 * `discipline` becomes `performerType`, the source is the form's own
 * ("limelight-page" on the public page, "app-site-panel" in the app), and
 * the consent version is the one of the privacy line that form shows.
 * `contactPref` and `phone` go through as they are, under the same rule as
 * everywhere: a phone number is required when the person asks for a call,
 * and dropped otherwise. `need` and `message` become the lead's "what they
 * need" text (see `needFromLegacyForm`).
 *
 * Not stored: `budget`, and a `message` too long to fit. They are still
 * validated, so the form behaves as before, but the lead table has no column
 * for them and the request form that replaces this one does not ask for
 * them.
 */
export async function submitLimelightLead(
  _prev: LimelightLeadState,
  formData: FormData
): Promise<LimelightLeadState> {
  // Honeypot: a field people never see. Bots fill it; we pretend it worked.
  if ((field(formData, "company") ?? "").length > 0) {
    return { ok: true, email: "" };
  }

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
    source: formData.get("source") ?? undefined,
    promotion: formData.get("promotion") ?? "",
  });
  if (!parsed.success) return { error: zodError(parsed.error) };
  const { need: needText, messageKept } = needFromLegacyForm(parsed.data.need, parsed.data.message);
  // Round 8: the chosen offer and its price are recorded with the request
  // (read from the configuration, never from the form). Stripe is not
  // connected, so this is what the team quotes.
  const offer = parsed.data.budget;
  const plan = LIMELIGHT.plans[offer];
  const promo = findPromotion(parsed.data.promotion);
  const promoCents = promo?.prices[offer === "essential" ? "LIMELIGHT_ESSENTIAL" : "LIMELIGHT_SIGNATURE"];
  // Round 8b: say whether the person verified their @usc.edu address in the app.
  let uscVerified = false;
  if (promo) {
    const session = await auth();
    if (session?.user?.id) {
      const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { uscVerifiedAt: true } });
      uscVerified = !!u?.uscVerifiedAt;
    }
  }
  const usd = (n: number) => "USD " + n;
  const offerLine =
    "Offer: " + offer + " (" + usd(plan.priceUsd) + " + " + usd(plan.renewalUsdPerYear) + " a year hosting)" +
    (promo && promoCents != null
      ? ". Promotion: " + promo.label + " (" + usd(promoCents / 100) + ", " + (uscVerified ? "USC email verified" : "not verified") + ")"
      : "");
  const need = [offerLine, needText].filter(Boolean).join(". ").slice(0, LIMELIGHT_NEED_MAX_LENGTH);

  const result = await recordInterest(
    {
      name: parsed.data.name,
      email: parsed.data.email,
      performerType: parsed.data.discipline,
      locale: parsed.data.locale,
      need,
      contactPref: parsed.data.contactPref,
      phone: parsed.data.phone,
      marketingOptIn: false,
      consentVersion: LIMELIGHT_DEFAULT_CONSENT_VERSION,
      source: parsed.data.source,
    },
    { clientKey: clientAddressKey(await headers()) }
  );

  if (result.ok) {
    if (result.created) scheduleOutboxDrain();
    if (!messageKept) {
      // Said out loud, with the reference and nothing the person wrote.
      console.warn(
        "[limelight] message over the stored length, not kept. Reference:",
        result.reference
      );
    }
    return { ok: true, email: parsed.data.email };
  }
  if (result.reason === "invalid") {
    const first = Object.values(result.fieldErrors)[0];
    return { error: err(first ?? "errors.invalidInput") };
  }
  if (result.reason === "rate_limited") {
    return { error: err("errors.limelightTooMany") };
  }
  return { error: err("errors.limelightSendFailed") };
}

const LeadId = z.string().trim().min(1).max(64);

/**
 * Owner view: move a lead to NEW, CONTACTED or CLOSED. Admins only. The
 * change and its audit entry (`limelight.lead.status`) are one transaction.
 *
 * Errors: `errors.unauthorized` (signed out), `errors.forbidden` (not an
 * admin), `errors.invalidInput` (unknown status), `errors.notFound`.
 */
export async function setLeadStatus(
  leadId: string,
  status: LimelightLeadStatus
): Promise<LeadStatusResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: err("errors.unauthorized") };
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true, email: true },
  });
  if (!(await isVerifiedAdmin(me && { id: session.user.id, ...me }))) return { ok: false, error: err("errors.forbidden") };

  const id = LeadId.safeParse(leadId);
  const next = LimelightLeadStatus.safeParse(status);
  if (!id.success || !next.success) {
    return { ok: false, error: err("errors.invalidInput") };
  }

  const changed = await changeLeadStatus(id.data, next.data, session.user.id);
  if (!changed) return { ok: false, error: err("errors.notFound") };

  revalidatePath("/[locale]/admin", "layout");
  return { ok: true, status: changed.after };
}
