import { prisma } from "@/lib/db";
import { B2C_PLANS, B2B_PLANS } from "@/domain/pricing";
import type { PlanB2C, PlanB2B } from "@/domain/enums";
import type { Billing, ChangePlanInput, SiteOrderCheckout } from "./index";

/**
 * Dev billing: applies plan changes immediately, no payment. For B2B per-seat
 * plans the price is seatCount × per-seat price. Real charges come from Stripe.
 * A Limelight order is reported as paid straight away.
 */
export class MockBilling implements Billing {
  readonly live = false;

  async changePlan(input: ChangePlanInput): Promise<{ checkoutUrl?: string }> {
    if (input.subjectType === "ARTIST") {
      const def = B2C_PLANS[input.plan as PlanB2C];
      await prisma.subscription.upsert({
        where: { subjectId: input.subjectId },
        create: {
          subjectType: "ARTIST",
          subjectId: input.subjectId,
          plan: def.plan,
          priceCents: def.priceCents,
          commissionRate: def.commissionRate,
          status: "ACTIVE",
        },
        update: {
          plan: def.plan,
          priceCents: def.priceCents,
          commissionRate: def.commissionRate,
          status: "ACTIVE",
        },
      });
    } else {
      const def = B2B_PLANS[input.plan as PlanB2B];
      const seats = input.seatCount ?? 1;
      const price = def.perSeat ? def.priceCents * seats : def.priceCents;
      await prisma.subscription.upsert({
        where: { subjectId: input.subjectId },
        create: {
          subjectType: "ORG",
          subjectId: input.subjectId,
          plan: def.plan,
          priceCents: price,
          seatCount: seats,
          status: "ACTIVE",
        },
        update: {
          plan: def.plan,
          priceCents: price,
          seatCount: seats,
          status: "ACTIVE",
        },
      });
      await prisma.organization.update({
        where: { id: input.subjectId },
        data: { plan: def.plan },
      });
    }
    return {};
  }

  /**
   * No payment page and no charge: the order counts as paid at once and the
   * caller fulfills it. The order row is not touched here.
   */
  async checkoutSiteOrder(): Promise<SiteOrderCheckout> {
    return { paid: true };
  }
}
