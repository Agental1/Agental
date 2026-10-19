import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { seo, jsonLd, serviceLd } from "@/lib/seo";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { InteractiveDemo } from "@/components/casting/interactive-demo";
import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { Section } from "@/components/marketing/section";
import {
  FramedCards,
  NumberedSteps,
  QuoteCards,
  SplitWordmark,
  StageCta,
} from "@/components/marketing/blocks";

/**
 * Agental Casting landing — v1 redesign.
 *
 * Same system as Talents on the dark skin. Where the Talents hero puts a face
 * on a stage, this one puts the product on it: the shortlist is the thing a
 * casting director is buying, so it is the first thing they see working.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "casting" });
  return seo({
    locale,
    path: "/casting",
    title: t("meta.title"),
    description: t("meta.description"),
  });
}

type Item = { title: string; body: string };
type Plan = {
  name: string;
  price: string;
  priceUnit: string;
  cta: string;
  features: string[];
};

export default async function CastingLanding({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "casting" });
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            serviceLd({
              locale,
              path: "/casting",
              name: t("meta.title"),
              description: t("meta.description"),
            })
          ),
        }}
      />
      <Hero />
      <Benefits />
      <Neutrality />
      <Steps />
      <Testimonials />
      <Pricing />
      <FinalCta />
    </>
  );
}

function Hero() {
  const t = useTranslations("casting.hero");
  return (
    <section className="px-[clamp(12px,2vw,24px)]">
      <div className="mx-auto max-w-site">
        <SplitWordmark portal="Casting" />

        <div className="stage-light relative isolate overflow-hidden rounded-sedan-2xl border border-white/[0.07] text-[#f2f2ee]">
          <div className="stage-beam spot-sweep pointer-events-none absolute inset-0 -z-10" />
          <div className="stage-grain pointer-events-none absolute inset-0 -z-10" />
          <div className="grid gap-12 p-[clamp(20px,3.5vw,48px)] lg:grid-cols-[1fr_1.05fr] lg:items-center">
            <div className="flex min-h-full flex-col justify-between gap-16">
              <p className="text-[13px] text-white/60">{t("eyebrow")}</p>
              <div>
                <h1 className="max-w-[12ch] text-[clamp(2.4rem,5vw,4.75rem)] font-semibold leading-[0.95] tracking-[-0.05em]">
                  {t("title")}{" "}
                  <span className="text-white/55">{t("titleEmph")}</span>
                </h1>
                <p className="mt-6 max-w-[52ch] text-[16px] leading-relaxed text-white/70">
                  {t("subtitle")}
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/casting/inscription"
                    className="inline-flex h-12 items-center rounded-full bg-[#f2f2ee] px-6 text-[15.5px] font-medium text-[#0e0e0e] transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    {t("ctaPrimary")}
                  </Link>
                  <Link
                    href="/casting/comment-ca-marche"
                    className="inline-flex h-12 items-center rounded-full border border-white/30 px-6 text-[15.5px] font-medium text-white transition-colors hover:border-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    {t("ctaSecondary")}
                  </Link>
                </div>
                <p className="mt-4 text-[13px] text-white/50">{t("note")}</p>
              </div>
            </div>
            {/* The product, live. Rendered in the casting skin. */}
            <div data-portal="casting" className="bg-transparent">
              <InteractiveDemo />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Benefits() {
  const t = useTranslations("casting.benefits");
  const items = t.raw("items") as Item[];
  return (
    <section className="mt-[clamp(48px,7vw,96px)] border-t border-border">
      <div className="mx-auto max-w-site px-[clamp(16px,3vw,40px)] pt-[clamp(64px,9vw,136px)]">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h2 className="display-lg mt-6 max-w-[14ch]">{t("title")}</h2>
      </div>
      <FramedCards items={items} className="mt-[clamp(40px,6vw,72px)]" />
      <div className="h-[clamp(64px,9vw,136px)]" />
    </section>
  );
}

/**
 * Neutrality: the objection every casting director raises about an agency
 * that also runs the shortlist. The answer is three product facts, shown as a
 * source badge would look in the shortlist itself.
 */
function Neutrality() {
  const t = useTranslations("casting.neutrality");
  const items = t.raw("items") as Item[];
  return (
    <Section data-demo="casting-neutrality" rhythm="major" className="border-t border-border">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-end">
        <div>
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="display-md mt-6 max-w-[16ch]">{t("title")}</h2>
        </div>
        <p className="text-[16.5px] leading-relaxed text-fg-muted">{t("body")}</p>
      </div>
      <dl className="mt-[clamp(40px,5vw,64px)] grid border-t border-border md:grid-cols-3">
        {items.map((item, i) => (
          <div
            key={item.title}
            className={cn(
              "border-b border-border py-6 md:border-b-0 md:px-6 md:py-8",
              i > 0 && "md:border-l",
              i === 0 && "md:pl-0"
            )}
          >
            <dt className="text-[clamp(1.25rem,1.8vw,1.5rem)] font-medium leading-tight tracking-[-0.035em]">
              {item.title}
            </dt>
            <dd className="mt-3 text-[14.5px] leading-relaxed text-fg-muted">{item.body}</dd>
          </div>
        ))}
      </dl>
      {/* What the badges look like on a shortlist row. */}
      <div aria-hidden="true" className="mt-8 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px]">
          <span className="size-1.5 rounded-full bg-signal" /> Agental
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px]">
          <span className="size-1.5 rounded-full bg-fg-subtle" /> External
        </span>
      </div>
    </Section>
  );
}

function Steps() {
  const t = useTranslations("casting.steps");
  const items = t.raw("items") as Item[];
  return (
    <Section rhythm="major" className="border-t border-border">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 className="display-md max-w-[14ch]">{t("title")}</h2>
        <Button asChild variant="secondary">
          <Link href="/casting/comment-ca-marche">{t("cta")}</Link>
        </Button>
      </div>
      <NumberedSteps items={items} className="mt-[clamp(40px,5vw,64px)]" />
    </Section>
  );
}

function Testimonials() {
  const t = useTranslations("casting.testimonials");
  const items = t.raw("items") as { quote: string; author: string }[];
  return (
    <Section rhythm="major" className="border-t border-border">
      <h2 className="display-md max-w-[16ch]">{t("title")}</h2>
      <div className="mt-[clamp(32px,5vw,56px)]">
        <QuoteCards items={items} />
      </div>
    </Section>
  );
}

function Pricing() {
  const t = useTranslations("casting.pricing");
  const plans = t.raw("plans") as Plan[];
  return (
    <Section id="tarifs" rhythm="major" className="border-t border-border">
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <h2 className="display-md mt-6 max-w-[16ch]">{t("title")}</h2>
      <div className="mt-[clamp(40px,5vw,64px)] grid gap-2.5 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan, i) => {
          const recommended = i === 1;
          return (
            <div
              key={plan.name}
              className={cn(
                "flex flex-col rounded-sedan-xl border p-[clamp(20px,2.4vw,28px)]",
                recommended
                  ? "border-transparent bg-surface-inverse text-fg-inverse"
                  : "border-border bg-surface"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[19px] font-medium tracking-[-0.03em]">{plan.name}</h3>
                {recommended && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border-inverse px-2.5 py-1 text-[11.5px]">
                    <span className="size-1.5 rounded-full bg-signal" />
                    {t("recommended")}
                  </span>
                )}
              </div>
              <div className="mt-8 flex items-baseline gap-1.5">
                <span className="text-[clamp(2.4rem,3.6vw,3rem)] font-semibold leading-none tracking-[-0.05em] tabular-nums">
                  {plan.price}
                </span>
                {plan.priceUnit && (
                  <span
                    className={cn(
                      "text-[13px]",
                      recommended ? "text-fg-inverse-muted" : "text-fg-muted"
                    )}
                  >
                    {plan.priceUnit}
                  </span>
                )}
              </div>
              <ul
                className={cn(
                  "mt-8 flex-1 border-t pt-4",
                  recommended ? "border-border-inverse/40" : "border-border"
                )}
              >
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 py-1.5 text-[14px]">
                    <Check
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        recommended ? "text-success-inverse" : "text-success"
                      )}
                    />
                    <span className={recommended ? "text-fg-inverse-muted" : "text-fg-muted"}>
                      {f}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href="/casting/inscription"
                className={cn(
                  "mt-8 inline-flex h-11 items-center justify-center rounded-full px-5 text-[15px] font-medium transition-colors",
                  recommended
                    ? "bg-fg-inverse text-surface-inverse hover:opacity-90"
                    : "border border-border text-fg hover:border-border-strong"
                )}
              >
                {plan.cta}
              </Link>
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-[13px] text-fg-subtle">{t("note")}</p>
    </Section>
  );
}

function FinalCta() {
  const t = useTranslations("casting.finalCta");
  return (
    <StageCta
      title={t("title")}
      body={t("body")}
      primary={{ href: "/casting/inscription", label: t("ctaPrimary") }}
      secondary={{ href: "/casting/comment-ca-marche", label: t("ctaSecondary") }}
    />
  );
}
