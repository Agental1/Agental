import type { PlanB2C, PlanB2B } from "./enums";

/**
 * Pricing & commission tables. Commission (B2C) is BUSINESS LOGIC applied to
 * cachets — never a Stripe concept. Prices are integer cents.
 */
export interface B2CPlanDef {
  plan: PlanB2C;
  priceCents: number;
  commissionRate: number; // fraction, e.g. 0.10
  dailyCandidatureLimit: number | null;
}

export const B2C_PLANS: Record<PlanB2C, B2CPlanDef> = {
  FREE: { plan: "FREE", priceCents: 0, commissionRate: 0.1, dailyCandidatureLimit: 0 },
  PRO: { plan: "PRO", priceCents: 1900, commissionRate: 0.1, dailyCandidatureLimit: 10 },
  PREMIUM: { plan: "PREMIUM", priceCents: 4900, commissionRate: 0.075, dailyCandidatureLimit: 50 },
  ULTIMATE: { plan: "ULTIMATE", priceCents: 7900, commissionRate: 0.05, dailyCandidatureLimit: null },
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
  PRO: { plan: "PRO", priceCents: 9900, perSeat: true, maxSeats: null, activeProjects: 10, filteredCandidaturesPerMonth: 1000 },
  STUDIO: { plan: "STUDIO", priceCents: 29900, perSeat: false, maxSeats: 5, activeProjects: null, filteredCandidaturesPerMonth: null },
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
