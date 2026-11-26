import type { PlanB2C, PlanB2B } from "./enums";

/**
 * Pricing & commission tables. Commission (B2C) is BUSINESS LOGIC applied to
 * cachets — never a Stripe concept. Prices are integer cents.
 */
/**
 * AI role-search allowance of a plan. `lifetime` is a one-time stock (Basic),
 * `monthly` resets every calendar month (Pro). `null` means "not set yet".
 */
export type AiSearchAllowance =
  | { kind: "lifetime"; count: number }
  | { kind: "monthly"; count: number }
  | null;

export interface B2CPlanDef {
  plan: PlanB2C;
  priceCents: number;
  /**
   * Yearly price shown when the visitor picks "Yearly": 10 months for 12.
   * Display only: payments are off and checkout never receives this figure.
   * Round 12, founder, 2026-11-26.
   */
  yearlyPriceCents: number;
  commissionRate: number; // fraction, e.g. 0.10
  dailyCandidatureLimit: number | null;
  aiSearches: AiSearchAllowance;
  /**
   * How many of the monthly AI searches may start on their own (the first
   * search when the profile is complete, the six-hour searches). Counted
   * inside `aiSearches`, never on top of it. null: no cap of its own yet
   * (only the plan's allowance applies).
   */
  autoSearches: number | null;
  /**
   * Round 8d (founders, 2026-11-22): how many of the performer's searches may
   * run at the same time. Each slot runs one search at a time and starts at
   * most one every `searchSpacingHours`.
   */
  searchSlots: number;
  /** The gap between two starts in one slot, in hours. */
  searchSpacingHours: number;
}

export const B2C_PLANS: Record<PlanB2C, B2CPlanDef> = {
  // Internal id stays FREE (no migration); the display name is "Basic" (messages).
  // Basic: 1 automatic search out of 5 (owner, round 7b).
  FREE: { plan: "FREE", priceCents: 0, yearlyPriceCents: 0, commissionRate: 0.1, dailyCandidatureLimit: 0, aiSearches: { kind: "monthly", count: 5 }, autoSearches: 1, searchSlots: 1, searchSpacingHours: 6 },
  // TODO(founders): automatic searches for Pro, Premium and Ultimate, proposed by
  // the agent in round 9 (2026-11-22): 20% of the allowance, the same ratio as
  // Basic's 1 of 5. docs/DECISIONS.md, "Round 9".
  PRO: { plan: "PRO", priceCents: 1900, yearlyPriceCents: 19000, commissionRate: 0.1, dailyCandidatureLimit: 10, aiSearches: { kind: "monthly", count: 50 }, autoSearches: 10, searchSlots: 2, searchSpacingHours: 6 },
  PREMIUM: { plan: "PREMIUM", priceCents: 4900, yearlyPriceCents: 49000, commissionRate: 0.075, dailyCandidatureLimit: 50, aiSearches: { kind: "monthly", count: 250 }, autoSearches: 50, searchSlots: 5, searchSpacingHours: 6 },
  ULTIMATE: { plan: "ULTIMATE", priceCents: 7900, yearlyPriceCents: 79000, commissionRate: 0.05, dailyCandidatureLimit: null, aiSearches: { kind: "monthly", count: 500 }, autoSearches: 100, searchSlots: 10, searchSpacingHours: 6 },
};

export interface B2BPlanDef {
  plan: PlanB2B;
  priceCents: number; // per seat/month for PRO; flat for STUDIO; 0 for FREE/ENTERPRISE(quote)
  perSeat: boolean;
  maxSeats: number | null;
  activeProjects: number | null;
  filteredCandidaturesPerMonth: number | null;
}

export const B2B_PLANS: Record<PlanB2B, B2BPlanDef> = {
  FREE: { plan: "FREE", priceCents: 0, perSeat: false, maxSeats: 1, activeProjects: 1, filteredCandidaturesPerMonth: 50 },
  PRO: { plan: "PRO", priceCents: 9500, perSeat: true, maxSeats: null, activeProjects: 10, filteredCandidaturesPerMonth: 1000 },
  STUDIO: { plan: "STUDIO", priceCents: 29500, perSeat: false, maxSeats: 5, activeProjects: null, filteredCandidaturesPerMonth: null },
  ENTERPRISE: { plan: "ENTERPRISE", priceCents: 0, perSeat: false, maxSeats: null, activeProjects: null, filteredCandidaturesPerMonth: null },
};

/** Commission owed on a cachet for a given B2C plan, in cents. */
export function commissionCents(plan: PlanB2C, cachetCents: number): number {
  return Math.round(cachetCents * B2C_PLANS[plan].commissionRate);
}

/** B2B quota limit for a metric; null = unlimited. */
export function b2bLimit(
  plan: PlanB2B,
  metric: "activeProjects" | "filteredCandidaturesPerMonth"
): number | null {
  return B2B_PLANS[plan][metric];
}

/**
 * Promotions (founders' decision, round 8, 2026-11-22). A list, so another
 * school can be added here without code: an id, a label (a proper noun, the
 * same in every language), who is eligible, and a price per product in cents.
 * Stripe is not connected: these prices are shown and recorded with requests;
 * checkout still answers "billing unavailable".
 */
export type PromoProduct = PlanB2C | "LIMELIGHT_ESSENTIAL" | "LIMELIGHT_SIGNATURE";

export interface Promotion {
  id: string;
  label: string;
  /** Eligible with an email address on one of these domains (or a subdomain). */
  eligibility: { emailDomains: readonly string[] };
  /** Promotional price per product, in cents. A product left out has no promotion. */
  prices: Partial<Record<PromoProduct, number>>;
}

export const PROMOTIONS: readonly Promotion[] = [
  {
    id: "usc-student",
    label: "USC student",
    eligibility: { emailDomains: ["usc.edu"] },
    // Round 8b (founders, 2026-11-22): Limelight Signature $69 for USC students.
    prices: { PRO: 900, PREMIUM: 2900, ULTIMATE: 5900, LIMELIGHT_ESSENTIAL: 2900, LIMELIGHT_SIGNATURE: 6900 },
  },
];

export function findPromotion(id: string | null | undefined): Promotion | null {
  return PROMOTIONS.find((p) => p.id === id) ?? null;
}

/** Is this email eligible for the promotion (e.g. name@usc.edu, name@cs.usc.edu)? */
export function promotionEligible(promo: Promotion, email: string | null | undefined): boolean {
  const domain = (email ?? "").toLowerCase().split("@")[1] ?? "";
  return promo.eligibility.emailDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
}
