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
  /** Apply a plan change. Returns a checkout URL when a real provider needs one. */
  changePlan(input: ChangePlanInput): Promise<{ checkoutUrl?: string }>;
}

let cached: Billing | null = null;

export async function getBilling(): Promise<Billing> {
  if (cached) return cached;
  // Select StripeBilling by env when implemented.
  const { MockBilling } = await import("./mock");
  cached = new MockBilling();
  return cached;
}
