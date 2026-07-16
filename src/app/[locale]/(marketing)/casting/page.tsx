import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "casting" });
  return { title: t("meta.title"), description: t("meta.description") };
}

type Item = { title: string; body: string };
type Plan = {
  name: string;
  price: string;
  priceUnit: string;
  cta: string;
  features: string[];
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-[0.15em] text-accent">
      {children}
    </span>
  );
}

export default function CastingLanding() {
  return (
    <>
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
    <section className="relative overflow-hidden border-b border-border">
      <div className="pointer-events-none absolute -left-40 -top-40 size-[32rem] rounded-full bg-accent-2/20 blur-3xl" />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:grid-cols-[0.95fr_1.05fr] md:py-24">
        <div className="space-y-6">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h1 className="font-display text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl">
            {t("title")}{" "}
            <span className="text-accent">{t("titleEmph")}</span>
          </h1>
          <p className="max-w-lg text-lg text-fg-muted">{t("subtitle")}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/casting/inscription">
                {t("ctaPrimary")} <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/casting/comment-ca-marche">{t("ctaSecondary")}</Link>
            </Button>
          </div>
          <p className="text-sm text-fg-subtle">{t("note")}</p>
        </div>
        <InteractiveDemo />
      </div>
    </section>
  );
}

function Benefits() {
  const t = useTranslations("casting.benefits");
  const items = t.raw("items") as Item[];
  const icons = [Layers, BadgeCheck, ListChecks, Scale];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="max-w-2xl space-y-3">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h2 className="font-display text-3xl font-medium sm:text-4xl">
          {t("title")}
        </h2>
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {items.map((item, i) => {
          const Icon = icons[i % icons.length];
          return (
            <div
              key={item.title}
              className="flex gap-4 rounded-sedan border border-border bg-surface p-6"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-sedan bg-accent-soft text-accent">
                <Icon className="size-5" />
              </span>
              <div>
                <h3 className="font-medium">{item.title}</h3>
                <p className="mt-1 text-sm text-fg-muted">{item.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Neutrality() {
  const t = useTranslations("casting.neutrality");
  const items = t.raw("items") as Item[];
  const icons = [Fingerprint, Scale, History];
  return (
    <section className="border-y border-border bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-6 text-accent" />
          <div className="space-y-1">
            <Eyebrow>{t("eyebrow")}</Eyebrow>
            <h2 className="font-display text-3xl font-medium sm:text-4xl">
              {t("title")}
            </h2>
          </div>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {items.map((item, i) => {
            const Icon = icons[i % icons.length];
            return (
              <div
                key={item.title}
                className="rounded-sedan border border-border bg-surface p-6"
              >
                <Icon className="size-5 text-accent" />
                <h3 className="mt-3 font-medium">{item.title}</h3>
                <p className="mt-1 text-sm text-fg-muted">{item.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Steps() {
  const t = useTranslations("casting.steps");
  const items = t.raw("items") as Item[];
  const icons = [FileText, Sparkles, Users];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl space-y-3">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="font-display text-3xl font-medium sm:text-4xl">
            {t("title")}
          </h2>
        </div>
        <Button asChild variant="link">
          <Link href="/casting/comment-ca-marche">
            {t("cta")} <ArrowRight />
          </Link>
        </Button>
      </div>
      <ol className="mt-10 grid gap-5 md:grid-cols-3">
        {items.map((item, i) => {
          const Icon = icons[i];
          return (
            <li
              key={item.title}
              className="rounded-sedan border border-border bg-surface p-6"
            >
              <div className="flex items-center gap-3 text-accent">
                <span className="font-display text-3xl">{i + 1}</span>
                <Icon className="size-5" />
              </div>
              <h3 className="mt-3 font-medium">{item.title}</h3>
              <p className="mt-1 text-sm text-fg-muted">{item.body}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Testimonials() {
  const t = useTranslations("casting.testimonials");
  const items = t.raw("items") as { quote: string; author: string }[];
  return (
    <section className="border-y border-border bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="font-display text-3xl font-medium sm:text-4xl">
          {t("title")}
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {items.map((item) => (
            <figure
              key={item.author}
              className="rounded-sedan border border-border bg-surface p-6"
            >
              <blockquote className="font-display text-lg leading-snug">
                « {item.quote} »
              </blockquote>
              <figcaption className="mt-4 text-sm text-fg-muted">
                {item.author}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const t = useTranslations("casting.pricing");
  const plans = t.raw("plans") as Plan[];
  return (
    <section id="tarifs" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="max-w-2xl space-y-3">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h2 className="font-display text-3xl font-medium sm:text-4xl">
          {t("title")}
        </h2>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan, i) => {
          const recommended = i === 1;
          return (
            <div
              key={plan.name}
              className={cn(
                "flex flex-col rounded-sedan border bg-surface p-6",
                recommended
                  ? "border-accent ring-1 ring-accent"
                  : "border-border"
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl">{plan.name}</h3>
                {recommended && <Badge variant="solid">{t("recommended")}</Badge>}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="font-display text-3xl">{plan.price}</span>
                {plan.priceUnit && (
                  <span className="text-sm text-fg-muted">
                    {plan.priceUnit}
                  </span>
                )}
              </div>
              <ul className="mt-5 flex-1 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <span className="text-fg-muted">{f}</span>
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
    </section>
  );
}

function FinalCta() {
  const t = useTranslations("casting.finalCta");
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="relative overflow-hidden rounded-sedan border border-accent-2/40 bg-surface px-8 py-16 text-center">
        <AgentalMark className="mx-auto h-10 w-auto text-accent" />
        <h2 className="mx-auto mt-5 max-w-2xl font-display text-3xl font-medium sm:text-4xl">
          {t("title")}
        </h2>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/casting/inscription">
              {t("ctaPrimary")} <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/casting/comment-ca-marche">{t("ctaSecondary")}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
