import { z } from "zod";
import { routing, toLocale } from "@/i18n/routing";
import type { ErrorKey } from "./action-result";
import { isWebUrl } from "./site";

/**
 * Limelight by Agental: websites for performers who do not have one.
 *
 * Everything that may change before launch lives here: the name (trademark
 * clearance pending), the URL slug, and the offer prices. Copy reads prices
 * from the message files, which must agree with these figures; the server uses
 * these for validation and, later, checkout.
 *
 * Prices are recommended launch prices in USD, decided 2026-11. Live payments
 * stay off until counsel signs off on the offer under California's talent and
 * automatic-renewal rules.
 */
export const LIMELIGHT = {
  name: "Limelight by Agental",
  slug: "limelight",
  /**
   * The beta is "by request": nobody pays in the app. While this is false,
   * `startSiteCheckout` answers `errors.billingUnavailable` and creates no
   * order, and publishing a site does not ask for one. Turning it on is the
   * owner's release decision, made here in code and nowhere else.
   */
  paymentsEnabled: false as boolean,
  /** Published sites will live on this wildcard domain (to confirm). */
  siteDomain: "agental.site",
  /** Months of the Talent Pro plan that come free with every purchase. */
  includedProMonths: 4,
  /** Hosting paid for by a purchase, in months, before the yearly renewal. */
  hostingTermMonths: 12,
  plans: {
    // Founders' decision, round 8 (2026-11-22): Essential hosting $25 a year,
    // Signature $149, student Essential $29 (hosting unchanged).
    essential: {
      priceUsd: 99,
      renewalUsdPerYear: 25,
      /** Student price (USC student promotion, see PROMOTIONS in pricing.ts). */
      studentPriceUsd: 29 as number | null,
    },
    // Round 8b (founders, 2026-11-22): student Signature $69.
    signature: { priceUsd: 149, renewalUsdPerYear: 79, studentPriceUsd: 69 as number | null },
  },
} as const;

/** The two offers a performer can buy. The keys of `LIMELIGHT.plans`. */
export const LimelightOffer = z.enum(["essential", "signature"]);
export type LimelightOffer = z.infer<typeof LimelightOffer>;

export const LIMELIGHT_DISCIPLINES = [
  "actor",
  "musician",
  "dancer",
  "voice",
  "model",
  "comedian",
  "creator",
  "other",
] as const;

export const LIMELIGHT_NEEDS = ["new", "redo", "unsure"] as const;
/** Round 8: choosing an offer is required; "custom" and "unsure" were removed. */
export const LIMELIGHT_BUDGETS = ["essential", "signature"] as const;
export const LIMELIGHT_CONTACT_PREFS = ["email", "call"] as const;
/** Where the "Start your site" form was sent from, so staff can tell them apart. */
export const LIMELIGHT_FORM_SOURCES = ["limelight-page", "app-site-panel"] as const;
export type LimelightFormSource = (typeof LIMELIGHT_FORM_SOURCES)[number];

/**
 * The "Start your site" form. Messages are app.errors keys (see
 * domain/action-result.ts), so the client renders them in the visitor's language.
 */
export const LimelightLeadInput = z.object({
  name: z.string().trim().min(1, "errors.limelightContactRequired").max(120),
  email: z.email("errors.emailInvalid").max(200),
  discipline: z.enum(LIMELIGHT_DISCIPLINES).catch("other"),
  need: z.enum(LIMELIGHT_NEEDS).catch("unsure"),
  budget: z.enum(LIMELIGHT_BUDGETS, { error: "errors.limelightOfferRequired" }),
  /** Round 8: a promotion the person checked (an id from PROMOTIONS). */
  promotion: z.string().trim().max(40).optional().default(""),
  contactPref: z.enum(LIMELIGHT_CONTACT_PREFS).catch("email"),
  phone: z.string().trim().max(40).optional().default(""),
  message: z.string().trim().max(2000).optional().default(""),
  locale: z.string().max(5).default("en"),
  source: z.enum(LIMELIGHT_FORM_SOURCES).catch("limelight-page"),
});

export type LimelightLead = z.infer<typeof LimelightLeadInput>;

// ------------------------------------------------- "Request a portfolio site"

/**
 * The consent text version recorded for a request that comes from the current
 * Limelight page form, which shows a privacy line and has no checkbox. A form
 * with its own consent text sends its own version (40 characters at most) and
 * changes it whenever the text changes.
 */
export const LIMELIGHT_DEFAULT_CONSENT_VERSION = "limelight-page-2026-11";

/** Where a lead stands for the team. Mirrors `LimelightLead.status`. */
export const LIMELIGHT_LEAD_STATUSES = ["NEW", "CONTACTED", "CLOSED"] as const;
export const LimelightLeadStatus = z.enum(LIMELIGHT_LEAD_STATUSES);
export type LimelightLeadStatus = z.infer<typeof LimelightLeadStatus>;

/**
 * A request reference, as quoted to the person and in the alert email:
 * "LL-" and eight characters of Crockford base32 (no I, L, O or U, so it
 * reads the same aloud and on paper).
 */
export const LIMELIGHT_REFERENCE_PATTERN = /^LL-[0-9A-HJKMNP-TV-Z]{8}$/;

/** Longest "what they need" text kept. */
export const LIMELIGHT_NEED_MAX_LENGTH = 500;

/** Control characters and runs of white space become one space. */
function oneLine(value: unknown): unknown {
  if (typeof value !== "string") return value;
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    out += code < 0x20 || code === 0x7f ? " " : value[i];
  }
  return out.replace(/\s+/g, " ").trim();
}

/** "" and null mean the optional field was left out. */
function blankToUndefined(value: unknown): unknown {
  const cleaned = oneLine(value);
  return cleaned == null || cleaned === "" ? undefined : cleaned;
}

/**
 * The body of `POST /api/limelight/interest`, and what the
 * `requestPortfolioSite` action builds from its form. Messages are app.errors
 * keys; a rule without one reads as `errors.invalidInput` (see
 * `limelightFieldErrors`). Unknown keys are dropped.
 *
 * - `name`: 1 to 120 characters once trimmed.
 * - `email`: trimmed and lowercased, 254 characters at most.
 * - `performerType`: optional, one of `LIMELIGHT_DISCIPLINES`.
 * - `portfolioUrl`: optional, an http or https address of 300 characters at
 *   most.
 * - `marketingOptIn`: a boolean, false when absent. It is stored apart from
 *   the consent to be contacted about the request.
 * - `consentVersion`: required, 40 characters at most. Its presence is the
 *   consent, so a form sends it only once the person agreed.
 * - `source`: required, 60 characters at most. Which page or campaign.
 * - `locale`: one of the app locales. Anything else, "en-US" included, is
 *   read by its language part and falls back to "en": a request is never
 *   refused over a language tag.
 * - `need`: optional, what the person needs in their own words, 500
 *   characters at most. Free text on purpose: the owner reads it to prepare
 *   the first reply, and three fixed choices say too little for that. Line
 *   breaks and control characters become spaces, so it is one line wherever
 *   it is shown or exported. The values of `LIMELIGHT_NEEDS` are valid text
 *   too, so a form with fixed choices can send them as they are.
 * - `contactPref`: "email" or "call", "email" when absent.
 *
 * Two fields are outside this schema. `phone` depends on `contactPref`, so
 * `parseLimelightInterest` checks it: use that function, never this schema
 * alone. The honeypot field `company` is looked at by `recordInterest`
 * before any validation.
 */
export const LimelightInterestInput = z.object({
  name: z.preprocess(
    (value) => oneLine(value ?? ""),
    z.string("errors.nameRequired").min(1, "errors.nameRequired").max(120)
  ),
  email: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
    z
      .string("errors.emailInvalid")
      .max(254, "errors.emailInvalid")
      .pipe(z.email("errors.emailInvalid"))
  ),
  performerType: z.preprocess(
    blankToUndefined,
    z.enum(LIMELIGHT_DISCIPLINES).optional()
  ),
  portfolioUrl: z.preprocess(
    (value) =>
      value == null || (typeof value === "string" && value.trim() === "")
        ? undefined
        : value,
    z
      .string("errors.urlInvalid")
      .trim()
      .max(300, "errors.urlInvalid")
      .refine((value) => isWebUrl(value, { allowHttp: true }), "errors.urlInvalid")
      .optional()
  ),
  marketingOptIn: z.preprocess((value) => value ?? false, z.boolean()),
  consentVersion: z.preprocess(
    (value) => oneLine(value ?? ""),
    z.string("errors.consentRequired").min(1, "errors.consentRequired").max(40)
  ),
  source: z.preprocess(oneLine, z.string().min(1).max(60)),
  locale: z.preprocess(
    (value) =>
      toLocale(
        typeof value === "string" ? value.trim().toLowerCase().split(/[-_]/)[0] : ""
      ),
    z.enum(routing.locales)
  ),
  need: z.preprocess(
    blankToUndefined,
    z.string().max(LIMELIGHT_NEED_MAX_LENGTH).optional()
  ),
  contactPref: z.preprocess(
    blankToUndefined,
    z.enum(LIMELIGHT_CONTACT_PREFS).default("email")
  ),
});

/**
 * A validated request. `phone` is present only when the person asked to be
 * called: with `contactPref: "email"` a phone number that was sent anyway is
 * dropped here and never reaches the database.
 */
export type LimelightInterest = z.infer<typeof LimelightInterestInput> & {
  phone?: string;
};

/** Longest phone number kept, as typed. */
export const LIMELIGHT_PHONE_MAX_LENGTH = 40;

/**
 * A phone number as a person types it: digits with spaces, dots, hyphens and
 * parentheses, an optional "+" in front, 7 to 15 digits in all (the ITU
 * E.164 bound). Returned with its white space collapsed, otherwise as typed,
 * so the owner reads the number the way the person wrote it. Null when it is
 * not a phone number.
 */
export function cleanPhone(value: unknown): string | null {
  const text = oneLine(value);
  if (typeof text !== "string" || text.length === 0) return null;
  if (text.length > LIMELIGHT_PHONE_MAX_LENGTH) return null;
  if (!/^\+?[0-9 ().-]+$/.test(text)) return null;
  const digits = text.replace(/[^0-9]/g, "").length;
  return digits >= 7 && digits <= 15 ? text : null;
}

/** The fields of the request a person can get wrong. */
export type LimelightInterestField = keyof LimelightInterest;

export type LimelightFieldErrors = Partial<Record<LimelightInterestField, ErrorKey>>;

/** The keys the request schema uses as messages. Anything else is generic. */
const INTEREST_ERROR_KEYS: ReadonlySet<string> = new Set<ErrorKey>([
  "errors.nameRequired",
  "errors.emailInvalid",
  "errors.urlInvalid",
  "errors.consentRequired",
]);

/**
 * One error key per field, from a failed `LimelightInterestInput` parse: the
 * first problem found on each field. A body that is not an object at all
 * gives an empty record; the caller answers `errors.invalidInput`.
 */
export function limelightFieldErrors(error: z.ZodError): LimelightFieldErrors {
  const fields: LimelightFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string" || field in fields) continue;
    fields[field as LimelightInterestField] = INTEREST_ERROR_KEYS.has(issue.message)
      ? (issue.message as ErrorKey)
      : "errors.invalidInput";
  }
  return fields;
}

export type LimelightInterestParse =
  | { ok: true; data: LimelightInterest }
  | { ok: false; fieldErrors: LimelightFieldErrors };

/**
 * Validate a request: `LimelightInterestInput`, plus the phone rule.
 *
 * A phone number is asked for only when the person wants a call
 * (`contactPref: "call"`). It is then required
 * (`errors.phoneRequired` when missing, `errors.phoneInvalid` when malformed) and must look like one
 * (`errors.invalidInput`). With any other preference the field is ignored,
 * whatever it holds, and left out of the result.
 *
 * Every field is reported in one pass, the phone included, so a form can
 * mark all of them at once.
 */
export function parseLimelightInterest(raw: unknown): LimelightInterestParse {
  const parsed = LimelightInterestInput.safeParse(raw);
  const fieldErrors = parsed.success ? {} : limelightFieldErrors(parsed.error);

  const record =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  // Read on its own, so the phone is judged even when another field failed.
  const wantsCall =
    z
      .preprocess(blankToUndefined, z.enum(LIMELIGHT_CONTACT_PREFS).optional())
      .safeParse(record.contactPref).data === "call";

  let phone: string | undefined;
  if (wantsCall) {
    const given = oneLine(record.phone);
    if (typeof given !== "string" || given.length === 0) {
      fieldErrors.phone = "errors.phoneRequired";
    } else {
      const cleaned = cleanPhone(given);
      if (cleaned) phone = cleaned;
      else fieldErrors.phone = "errors.phoneInvalid";
    }
  }

  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }
  return { ok: true, data: phone ? { ...parsed.data, phone } : parsed.data };
}

