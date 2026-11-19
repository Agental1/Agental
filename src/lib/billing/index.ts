import type { PlanB2C, PlanB2B } from "@/domain/enums";
import type { LimelightOffer } from "@/domain/limelight";

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

/** A one-time Limelight purchase. The SiteOrder row exists before this is called. */
export interface SiteOrderCheckoutInput {
  orderId: string;
  userId: string;
  amountCents: number;
  offer: LimelightOffer;
}

export interface SiteOrderCheckout {
  /** Where to send the buyer to pay. Absent when no payment page is needed. */
  checkoutUrl?: string;
  /**
   * true when the money is already in, so the caller fulfills the order now
   * (src/lib/sites.ts, fulfillSiteOrder). A real provider answers false with a
   * checkoutUrl and the order is fulfilled later, from its webhook.
   */
  paid: boolean;
}

export interface Billing {
  /** false for the dev mock: plan changes are applied with no payment. */
  readonly live: boolean;
  /** Apply a plan change. Returns a checkout URL when a real provider needs one. */
  changePlan(input: ChangePlanInput): Promise<{ checkoutUrl?: string }>;
  /**
   * Take payment for a Limelight order. It never touches the order itself:
   * marking it PAID and granting what it includes is fulfillSiteOrder's job,
   * so the mock and a webhook go through the same code.
   */
  checkoutSiteOrder(input: SiteOrderCheckoutInput): Promise<SiteOrderCheckout>;
}

/**
 * May this plan change go through? The mock grants any plan for free, so in
 * production it is refused for paid plans unless ALLOW_MOCK_BILLING=true is set
 * on purpose (a private beta, say). Real billing replaces this check.
 * Limelight orders pass through the same gate, with the order amount.
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
