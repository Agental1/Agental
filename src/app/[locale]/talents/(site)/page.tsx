import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ShieldCheck,
  Bot,
  Gift,
  Target,
  Sparkles,
  TrendingUp,
  Star,
  UserPlus,
  FileSignature,
  Radar,
  Video,
  Award,
  Check,
  ArrowRight,
  Quote,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AgentalMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "talents" });
  return { title: t("meta.title"), description: t("meta.description") };
}

const WHY_ICONS = [ShieldCheck, Bot, Target, Sparkles, TrendingUp, Star];
const STEP_ICONS = [UserPlus, FileSignature, Radar, Video, Award];

type Item = { title: string; body: string };
type Plan = {
  name: string;
  price: string;
  commission: string;
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

export default async function TalentsLanding({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  return (
    <>
      <Hero />
      <Proof />
      <Why />
      <Steps />
      <SelfTape />
      <Pricing />
      <Testimonials />
      <Minors />
      <FinalCta />
    </>
  );
}

function Hero() {
  const t = useTranslations("talents.hero");
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-24 -top-24 size-[28rem] rounded-full bg-accent-soft blur-3xl opacity-60" />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 md:grid-cols-[1.1fr_0.9fr] md:py-28 md:items-center">
        <div className="space-y-6">
          <h1 className="font-display text-4xl font-medium leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            {t("title")}
            <br />
            <span className="text-accent">{t("titleEmph")}</span>
          </h1>
          <p className="max-w-lg text-lg text-fg-muted">{t("subtitle")}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/talents/inscription">
                {t("ctaPrimary")} <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/talents/comment-ca-marche">{t("ctaSecondary")}</Link>
            </Button>
          </div>
        </div>
        <HeroCollage />
      </div>
    </section>
  );
}

function HeroCollage() {
  const faces = [
    "femme 60+, sourire franc",
    "ado, 16 ans, banlieue",
    "homme 40s, fauteuil, costume",
    "enfant, 6 ans, rêveur",
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {faces.map((f, i) => (
        <div
          key={f}
          className={cn(
            "flex aspect-[4/5] items-end rounded-sedan border border-border p-3 text-sm text-fg-muted",
            i % 2 === 0 ? "bg-surface" : "bg-surface-2",
            i === 1 && "translate-y-4",
            i === 2 && "-translate-y-4"
          )}
        >
          <span className="flex items-center gap-1.5">
            <AgentalMark className="h-3.5 w-auto text-accent/60" />
            {f}
          </span>
        </div>
      ))}
    </div>
  );
}

function Proof() {
  const t = useTranslations("talents.proof");
  const items = [
    { key: "regulated", Icon: ShieldCheck },
    { key: "ai", Icon: Bot },
    { key: "free", Icon: Gift },
  ] as const;
  return (
    <section className="border-y border-border bg-surface-2/40">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-3">
        {items.map(({ key, Icon }) => (
          <div key={key} className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-sedan bg-accent-soft text-accent">
              <Icon className="size-4.5" />
            </span>
            <div>
              <p className="font-medium">{t(`${key}.title`)}</p>
              <p className="text-sm text-fg-muted">{t(`${key}.body`)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Why() {
  const t = useTranslations("talents.why");
  const items = t.raw("items") as Item[];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="max-w-2xl space-y-3">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h2 className="font-display text-3xl font-medium sm:text-4xl">
          {t("title")}
        </h2>
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => {
          const Icon = WHY_ICONS[i % WHY_ICONS.length];
          return (
            <div
              key={item.title}
              className="rounded-sedan border border-border bg-surface p-6 shadow-sm"
            >
              <span className="flex size-10 items-center justify-center rounded-sedan bg-accent-soft text-accent">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 font-medium">{item.title}</h3>
              <p className="mt-1.5 text-sm text-fg-muted">{item.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Steps() {
  const t = useTranslations("talents.steps");
  const items = t.raw("items") as Item[];
  return (
    <section className="border-y border-border bg-surface-2/40">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl space-y-3">
            <Eyebrow>{t("eyebrow")}</Eyebrow>
            <h2 className="font-display text-3xl font-medium sm:text-4xl">
              {t("title")}
            </h2>
          </div>
          <Button asChild variant="link">
            <Link href="/talents/comment-ca-marche">
              {t("cta")} <ArrowRight />
            </Link>
          </Button>
        </div>
        <ol className="mt-10 grid gap-5 md:grid-cols-5">
          {items.map((item, i) => {
            const Icon = STEP_ICONS[i];
            return (
              <li
                key={item.title}
                className="rounded-sedan border border-border bg-surface p-5"
              >
                <div className="flex items-center gap-2 text-accent">
                  <span className="font-display text-2xl">{i + 1}</span>
                  <Icon className="size-4" />
                </div>
                <h3 className="mt-3 font-medium leading-tight">{item.title}</h3>
                <p className="mt-1.5 text-sm text-fg-muted">{item.body}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function SelfTape() {
  const t = useTranslations("talents.selftape");
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="overflow-hidden rounded-sedan border border-border bg-gradient-to-br from-surface to-accent-soft">
        <div className="grid gap-8 p-8 md:grid-cols-2 md:items-center md:p-12">
          <div className="space-y-4">
            <Eyebrow>{t("eyebrow")}</Eyebrow>
            <h2 className="font-display text-3xl font-medium sm:text-4xl">
              {t("title")}
            </h2>
            <Button asChild>
              <Link href="/talents/comment-ca-marche">
                {t("cta")} <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="relative aspect-video overflow-hidden rounded-sedan border border-border bg-noirchaud/80">
            <div className="absolute inset-3 rounded-[calc(var(--sedan)-0.2rem)] border-2 border-dashed border-creme/30" />
            <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-noirchaud/70 px-3 py-1.5 text-xs text-creme">
              <Video className="size-3.5" />
              {t("hint")}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const t = useTranslations("talents.pricing");
  const plans = t.raw("plans") as Plan[];
  return (
    <section
      id="tarifs"
      className="border-y border-border bg-surface-2/40"
    >
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl space-y-3">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="font-display text-3xl font-medium sm:text-4xl">
            {t("title")}
          </h2>
          <p className="text-sm text-fg-muted">{t("note")}</p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan, i) => {
            const popular = i === 1;
            return (
              <div
                key={plan.name}
                className={cn(
                  "flex flex-col rounded-sedan border bg-surface p-6",
                  popular
                    ? "border-accent shadow-md ring-1 ring-accent"
                    : "border-border shadow-sm"
                )}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl">{plan.name}</h3>
                  {popular && <Badge variant="solid">{t("popular")}</Badge>}
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="font-display text-3xl">{plan.price}</span>
                  <span className="text-sm text-fg-muted">
                    /{t("perMonth")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-fg-subtle">
                  {t("commission", { rate: plan.commission })}
                </p>
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
                  variant={popular ? "primary" : "secondary"}
                >
                  <Link href="/talents/inscription">{plan.cta}</Link>
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  const t = useTranslations("talents.testimonials");
  const items = t.raw("items") as { quote: string; author: string }[];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <h2 className="font-display text-3xl font-medium sm:text-4xl">
        {t("title")}
      </h2>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {items.map((item) => (
          <figure
            key={item.author}
            className="flex flex-col rounded-sedan border border-border bg-surface p-6 shadow-sm"
          >
            <Quote className="size-6 text-accent/50" />
            <blockquote className="mt-3 flex-1 font-display text-lg leading-snug">
              « {item.quote} »
            </blockquote>
            <figcaption className="mt-4 text-sm text-fg-muted">
              {item.author}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function Minors() {
  const t = useTranslations("talents.minors");
  const items = t.raw("items") as string[];
  return (
    <section className="border-y border-border bg-surface-2/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.2fr] md:items-center">
        <div className="space-y-4">
          <span className="flex size-12 items-center justify-center rounded-sedan bg-accent-soft text-accent">
            <ShieldCheck className="size-6" />
          </span>
          <h2 className="font-display text-2xl font-medium sm:text-3xl">
            {t("title")}
          </h2>
          <Button asChild variant="link" className="px-0">
            <Link href="/talents/comment-ca-marche">
              {t("cta")} <ArrowRight />
            </Link>
          </Button>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2 rounded-sedan border border-border bg-surface p-4 text-sm"
            >
              <Check className="mt-0.5 size-4 shrink-0 text-success" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FinalCta() {
  const t = useTranslations("talents.finalCta");
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="relative overflow-hidden rounded-sedan border border-border bg-espresso px-8 py-16 text-center text-creme">
        <AgentalMark className="mx-auto h-10 w-auto text-abricot" />
        <h2 className="mt-5 font-display text-3xl font-medium sm:text-4xl">
          {t("title")}
        </h2>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button
            asChild
            size="lg"
            className="bg-abricot text-espresso hover:bg-abricot/90"
          >
            <Link href="/talents/inscription">
              {t("ctaPrimary")} <ArrowRight />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="text-creme hover:bg-creme/10"
          >
            <Link href="/talents/faq">{t("ctaSecondary")}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
