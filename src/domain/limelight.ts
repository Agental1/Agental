import { z } from "zod";

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
  /** Published sites will live on this wildcard domain (to confirm). */
  siteDomain: "agental.site",
  /** Months of the Talent Pro plan that come free with every purchase. */
  includedProMonths: 4,
  /** Hosting paid for by a purchase, in months, before the yearly renewal. */
  hostingTermMonths: 12,
  plans: {
    essential: {
      priceUsd: 99,
      renewalUsdPerYear: 49,
      /**
       * Price for a student an admin approved. The founders have not set the
       * amount: while it is null, an approved student pays `priceUsd`.
       */
      studentPriceUsd: null as number | null,
    },
    signature: { priceUsd: 199, renewalUsdPerYear: 79 },
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
export const LIMELIGHT_BUDGETS = ["essential", "signature", "custom", "unsure"] as const;
export const LIMELIGHT_CONTACT_PREFS = ["email", "call"] as const;

/**
 * The "Start your site" form. Messages are app.errors keys (see
 * domain/action-result.ts), so the client renders them in the visitor's language.
 */
export const LimelightLeadInput = z.object({
  name: z.string().trim().min(1, "errors.limelightContactRequired").max(120),
  email: z.email("errors.emailInvalid").max(200),
  discipline: z.enum(LIMELIGHT_DISCIPLINES).catch("other"),
  need: z.enum(LIMELIGHT_NEEDS).catch("unsure"),
  budget: z.enum(LIMELIGHT_BUDGETS).catch("unsure"),
  contactPref: z.enum(LIMELIGHT_CONTACT_PREFS).catch("email"),
  phone: z.string().trim().max(40).optional().default(""),
  message: z.string().trim().max(2000).optional().default(""),
  locale: z.string().max(5).default("en"),
});

export type LimelightLead = z.infer<typeof LimelightLeadInput>;
