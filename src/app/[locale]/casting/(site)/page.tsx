import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { seo, jsonLd, serviceLd } from "@/lib/seo";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Layers,
  BadgeCheck,
  ListChecks,
  Scale,
  FileText,
  Sparkles,
  Users,
  Check,
  ArrowRight,
  ShieldCheck,
  History,
  Fingerprint,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AgentalMark } from "@/components/brand/logo";
import { InteractiveDemo } from "@/components/casting/interactive-demo";
import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { Section } from "@/components/marketing/section";
import { InverseBand } from "@/components/marketing/inverse-band";

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
    <Section
      rhythm="none"
      innerClassName="grid items-center gap-12 py-[clamp(40px,6vw,84px)] md:grid-cols-[0.95fr_1.05fr]"
    >
      <div>
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h1 className="mt-4 text-[clamp(36px,5.6vw,62px)] font-bold leading-[1.03] tracking-[-0.02em]">
          {t("title")} {t("titleEmph")}
        </h1>
        <p className="mt-5 max-w-[56ch] text-[clamp(16px,1.6vw,19px)] leading-relaxed text-fg-muted">
          {t("subtitle")}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/casting/inscription">
              {t("ctaPrimary")} <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/casting/comment-ca-marche">{t("ctaSecondary")}</Link>
          </Button>
        </div>
        <p className="mt-4 font-mono text-[11px] text-fg-subtle">{t("note")}</p>
      </div>
      <InteractiveDemo />
    </Section>
  );
}

function Benefits() {
  const t = useTranslations("casting.benefits");
  const items = t.raw("items") as Item[];
  // Six icons since the mockups grew this grid from four items to six.
  const icons = [Layers, ListChecks, BadgeCheck, Scale, ShieldCheck, History];
  return (
    <Section rhythm="major">
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <h2 className="mt-4 text-[clamp(26px,3.8vw,44px)] font-bold leading-[1.05] tracking-[-0.02em]">
        {t("title")}
      </h2>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => {
          const Icon = icons[i % icons.length];
          return (
            <div
              key={item.title}
              className="rounded-sedan-xl border border-border bg-surface p-[clamp(20px,3vw,26px)]"
            >
              <span className="flex size-11 items-center justify-center rounded-sedan bg-surface-2 text-accent">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 text-[18px] font-bold leading-tight">
                {item.title}
              </h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-fg-muted">
                {item.body}
              </p>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function Neutrality() {
  const t = useTranslations("casting.neutrality");
  const items = t.raw("items") as Item[];
  const icons = [Fingerprint, Scale, History];
  return (
    <Section data-demo="casting-neutrality" tone="band" rhythm="band">
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <h2 className="mt-4 max-w-[24ch] text-[clamp(24px,3.2vw,38px)] font-bold leading-[1.08] tracking-[-0.02em]">
        {t("title")}
      </h2>
      <p className="mt-5 max-w-[74ch] leading-relaxed text-fg-muted">
        {t("body")}
      </p>
      <div className="mt-9 grid gap-5 md:grid-cols-3">
        {items.map((item, i) => {
          const Icon = icons[i % icons.length];
          return (
            <div
              key={item.title}
              className="rounded-sedan-lg border border-border bg-surface p-5"
            >
              <Icon className="size-5 text-accent" />
              <h3 className="mt-3 text-[15px] font-bold">{item.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">
                {item.body}
              </p>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function Steps() {
  const t = useTranslations("casting.steps");
  const items = t.raw("items") as Item[];
  const icons = [FileText, Sparkles, Users];
  return (
    <Section rhythm="major">
      <h2 className="text-[clamp(26px,3.8vw,44px)] font-bold leading-[1.05] tracking-[-0.02em]">
        {t("title")}
      </h2>
      <ol className="mt-9 grid gap-5 md:grid-cols-3">
        {items.map((item, i) => {
          const Icon = icons[i];
          return (
            <li
              key={item.title}
              className="rounded-sedan-lg border border-border bg-surface p-[clamp(20px,3vw,26px)]"
            >
              <div className="flex items-center gap-3 text-accent">
                <span className="font-mono text-[18px] font-bold">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Icon className="size-5" />
              </div>
              <h3 className="mt-3 text-[16px] font-bold">{item.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">
                {item.body}
              </p>
            </li>
          );
        })}
      </ol>
      <Button asChild variant="secondary" className="mt-8">
        <Link href="/casting/comment-ca-marche">
          {t("cta")} <ArrowRight />
        </Link>
      </Button>
    </Section>
  );
}

function Testimonials() {
  const t = useTranslations("casting.testimonials");
  const items = t.raw("items") as { quote: string; author: string }[];
  return (
    <Section tone="band" rhythm="band">
      <h2 className="text-[clamp(26px,3.8vw,44px)] font-bold leading-[1.05] tracking-[-0.02em]">
        {t("title")}
      </h2>
      <div className="mt-9 grid gap-5 md:grid-cols-3">
        {items.map((item) => (
          <figure
            key={item.author}
            className="flex flex-col rounded-sedan-xl border border-border bg-surface p-[clamp(20px,3vw,26px)]"
          >
            <blockquote className="flex-1 text-[15px] italic leading-relaxed">
              « {item.quote} »
            </blockquote>
            <figcaption className="mt-5 text-[13.5px] text-fg-muted">
              {item.author}
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

function Pricing() {
  const t = useTranslations("casting.pricing");
  const plans = t.raw("plans") as Plan[];
  return (
    <Section id="tarifs" rhythm="major">
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <h2 className="mt-4 text-[clamp(26px,3.8vw,44px)] font-bold leading-[1.05] tracking-[-0.02em]">
        {t("title")}
      </h2>
      <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan, i) => {
          const recommended = i === 1;
          return (
            <div
              key={plan.name}
              className={cn(
                "flex flex-col rounded-sedan-xl border p-[clamp(20px,3vw,26px)]",
                recommended
                  ? "border-transparent bg-surface-inverse text-fg-inverse"
                  : "border-border bg-surface"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold">{plan.name}</h3>
                {recommended && <Badge variant="mono">{t("recommended")}</Badge>}
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="font-mono text-[32px] font-bold leading-none">
                  {plan.price}
                </span>
                {plan.priceUnit && (
                  <span
                    className={cn(
                      "text-sm",
                      recommended ? "text-fg-inverse-muted" : "text-fg-muted"
                    )}
                  >
                    {plan.priceUnit}
                  </span>
                )}
              </div>
              <ul className="mt-5 flex-1 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        recommended ? "text-success-inverse" : "text-success"
                      )}
                    />
                    <span
                      className={
                        recommended ? "text-fg-inverse-muted" : "text-fg-muted"
                      }
                    >
                      {f}
                    </span>
                  </li>
                ))}
              </ul>
              <Button
                asChild
                className="mt-6"
                variant={recommended ? "primary" : "secondary"}
              >
                <Link href="/casting/inscription">{plan.cta}</Link>
              </Button>
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-sm text-fg-subtle">{t("note")}</p>
    </Section>
  );
}

function FinalCta() {
  const t = useTranslations("casting.finalCta");
  return (
    <Section width="narrow" rhythm="major">
      <InverseBand>
        <AgentalMark className="mx-auto h-10 w-auto text-cta" />
        <h2 className="mx-auto mt-5 max-w-[22ch] text-[clamp(26px,3.8vw,44px)] font-bold leading-[1.05] tracking-[-0.02em]">
          {t("title")}
        </h2>
        <p className="mx-auto mt-4 max-w-[54ch] leading-relaxed text-fg-inverse-muted">
          {t("body")}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/casting/inscription">
              {t("ctaPrimary")} <ArrowRight />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="border-border-inverse bg-transparent text-fg-inverse hover:bg-fg-inverse/10"
          >
            <Link href="/casting/comment-ca-marche">{t("ctaSecondary")}</Link>
          </Button>
        </div>
      </InverseBand>
    </Section>
  );
}
