import type { PlanB2C, PlanB2B } from "@/domain/enums";

/**
 * Swappable billing. MockBilling (dev) changes plans instantly with no payment;
 * a StripeBilling impl (prod) returns Checkout URLs + reconciles via webhooks,
 * behind the same interface. Callers never touch Stripe directly.
 */
export interface ChangePlanInput {
  subjectType: "ARTIST" | "ORG";
  subjectId: string;
  plan: PlanB2C | PlanB2B;
  seatCount?: number;
}

export interface Billing {
  /** false for the dev mock: plan changes are applied with no payment. */
  readonly live: boolean;
  /** Apply a plan change. Returns a checkout URL when a real provider needs one. */
  changePlan(input: ChangePlanInput): Promise<{ checkoutUrl?: string }>;
}

/**
 * May this plan change go through? The mock grants any plan for free, so in
 * production it is refused for paid plans unless ALLOW_MOCK_BILLING=true is set
 * on purpose (a private beta, say). Real billing replaces this check.
 */
export function paidPlanAllowed(billing: Billing, priceCents: number): boolean {
  if (billing.live || priceCents === 0) return true;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.ALLOW_MOCK_BILLING === "true";
}

let cached: Billing | null = null;

export async function getBilling(): Promise<Billing> {
  if (cached) return cached;
  // Select StripeBilling by env when implemented.
  const { MockBilling } = await import("./mock");
  cached = new MockBilling();
  return cached;
}
