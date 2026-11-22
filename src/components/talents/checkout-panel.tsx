"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BadgeCheck, Check, CreditCard, Lock } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PromoPrice } from "@/components/talents/promotions";
import { UscVerifySteps, type UscVerified } from "@/components/talents/usc-verify";
import { recordPlanChoice } from "@/app/actions/checkout";
import { USC_PROMOTION_ID } from "@/domain/promo-verification";
import type { PlanCard } from "@/components/talents/plan-selector";

type Step = "summary" | "usc" | "card";

/**
 * "Choose" on a paid plan (round 8b): a large panel over Subscription with
 * the plan, its price and what is included. With the USC student promotion
 * checked and the account not yet verified, the two USC steps come first.
 * Then the card step: the usual fields, disabled, under a notice that card
 * payments are not open. Nothing is typed, sent or stored, no payment
 * provider is called and the plan does not change; the choice is recorded
 * so the team can write when payments open.
 */
export function CheckoutPanel({
  plan,
  promotion,
  usc,
  onUscVerified,
  onClose,
}: {
  plan: PlanCard | null;
  /** The promotion checked in the Promotions panel, if any. */
  promotion: string | null;
  usc: UscVerified | null;
  onUscVerified: (v: UscVerified) => void;
  onClose: () => void;
}) {
  const t = useTranslations("talents.checkout");
  const locale = useLocale();
  const [step, setStep] = useState<Step>("summary");
  const [, start] = useTransition();

  const uscActive = promotion === USC_PROMOTION_ID && !!plan?.promos?.[USC_PROMOTION_ID];
  // The student price applies once the account is verified.
  const promoForPrice = uscActive && usc ? USC_PROMOTION_ID : null;

  /** `justVerified`: the USC code was confirmed a moment ago (the prop has not caught up). */
  function toCard(justVerified = false) {
    if (!plan) return;
    setStep("card");
    const promo = uscActive && (usc || justVerified) ? USC_PROMOTION_ID : null;
    start(async () => {
      // Best effort: the notice shows either way.
      await recordPlanChoice(plan.plan, promo).catch(() => undefined);
    });
  }

  function next() {
    if (uscActive && !usc) setStep("usc");
    else toCard(false);
  }

  const verifiedLine = usc && (
    <p className="flex items-center gap-2 rounded-sedan border border-[var(--go)]/40 bg-surface px-3 py-2 text-sm">
      <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-[var(--go)]" />
      {t("verified", {
        date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(usc.at)),
        email: usc.email,
      })}
    </p>
  );

  return (
    <Sheet
      open={!!plan}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setStep("summary");
        }
      }}
    >
      <SheetContent
        data-portal="talents"
        side="right"
        closeLabel={t("close")}
        className="w-full overflow-y-auto p-6 sm:max-w-xl sm:p-8"
      >
        {plan && (
          <div className="space-y-6">
            <div>
              <SheetTitle className="font-display text-2xl font-medium">{t("title", { plan: plan.name })}</SheetTitle>
              <SheetDescription className="mt-1 text-fg-muted">{t("lead")}</SheetDescription>
            </div>

            <div className="rounded-sedan-xl border border-border bg-surface-2/40 p-5">
              <div className="flex flex-wrap items-baseline gap-2">
                <PromoPrice
                  base={plan.price}
                  promos={promoForPrice ? plan.promos : undefined}
                  className="font-display text-3xl"
                />
                <span className="text-sm text-fg-muted">{t("perMonth")}</span>
              </div>
              <p className="mt-1 text-sm text-fg-muted">{t("commission", { rate: plan.commission })}</p>
              <ul className="mt-4 space-y-1.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {verifiedLine}

            {step === "summary" && (
              <div className="space-y-3">
                {uscActive && !usc && <p className="text-sm text-fg-muted">{t("uscNext")}</p>}
                <Button onClick={next} className="w-full sm:w-auto">
                  {t("continue")}
                </Button>
              </div>
            )}

            {step === "usc" && (
              <section aria-labelledby="usc-title" className="space-y-3 rounded-sedan-xl border border-border p-5">
                <h3 id="usc-title" className="font-display text-lg font-medium">
                  {t("usc.title")}
                </h3>
                <UscVerifySteps
                  onVerified={(v) => {
                    onUscVerified(v);
                    toCard(true);
                  }}
                />
              </section>
            )}

            {step === "card" && (
              <section aria-labelledby="card-notice" className="space-y-4">
                <p
                  id="card-notice"
                  role="alert"
                  className="flex gap-3 rounded-sedan-xl border-2 border-danger bg-danger/5 p-5 text-[1.125rem] font-bold leading-snug"
                >
                  <Lock aria-hidden="true" className="mt-1 size-5 shrink-0 text-danger" />
                  {t("cardNotice")}
                </p>
                <fieldset disabled aria-describedby="card-notice" className="space-y-3 opacity-60">
                  <legend className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <CreditCard aria-hidden="true" className="size-4" /> {t("cardLegend")}
                  </legend>
                  {/* Display only: no name attribute, nothing is ever sent. */}
                  <label className="block space-y-1 text-sm">
                    <span>{t("cardName")}</span>
                    <Input disabled autoComplete="off" />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span>{t("cardNumber")}</span>
                    <Input disabled autoComplete="off" placeholder="1234 1234 1234 1234" />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-1 text-sm">
                      <span>{t("cardExpiry")}</span>
                      <Input disabled autoComplete="off" placeholder="MM / YY" />
                    </label>
                    <label className="block space-y-1 text-sm">
                      <span>{t("cardCvc")}</span>
                      <Input disabled autoComplete="off" placeholder="CVC" />
                    </label>
                  </div>
                </fieldset>
                <p className="text-sm text-fg-muted">{t("recorded")}</p>
                <Button
                  onClick={() => {
                    onClose();
                    setStep("summary");
                  }}
                  className="w-full sm:w-auto"
                >
                  {t("gotIt")}
                </Button>
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
