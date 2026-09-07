import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import Image from "next/image";
import { seo, jsonLd, serviceLd } from "@/lib/seo";
import { useTranslations, useLocale } from "next-intl";
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
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { Section } from "@/components/marketing/section";
import { InverseBand } from "@/components/marketing/inverse-band";
import { PORTRAITS } from "@/data/portraits";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "talents" });
  return seo({
    locale,
    path: "/talents",
    title: t("meta.title"),
    description: t("meta.description"),
  });
}

const WHY_ICONS = [ShieldCheck, Bot, Target, Sparkles, TrendingUp, Star];
const STEP_ICONS = [UserPlus, FileSignature, Radar, Video, Award];

type Item = { title: string; body: string };
type Plan = {
  name: string;
  price: string;
  commission: string;
};

export default async function TalentsLanding({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "talents" });
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            serviceLd({
              locale,
              path: "/talents",
              name: t("meta.title"),
              description: t("meta.description"),
            })
          ),
        }}
      />
      <Hero />
      <Proof />
      <Why />
      <ResponseRate />
      <Steps />
      <SelfTape />
      <Commission />
      <Testimonials />
      <Minors />
      <FinalCta />
    </>
  );
}

function Hero() {
  const t = useTranslations("talents.hero");
  return (
    <Section
      rhythm="none"
      innerClassName="grid gap-12 py-[clamp(40px,6vw,84px)] md:grid-cols-[1.05fr_0.95fr] md:items-center"
    >
      <div>
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h1 className="mt-4 text-[clamp(36px,5.6vw,62px)] font-bold leading-[1.03] tracking-[-0.02em]">
          {t("title")} {t("titleEmph")}
        </h1>
        <p className="mt-5 max-w-[58ch] text-[clamp(16px,1.6vw,19px)] leading-relaxed text-fg-muted">
          {t("subtitle")}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/talents/inscription">
              {t("ctaPrimary")} <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/talents/comment-ca-marche">{t("ctaSecondary")}</Link>
          </Button>
        </div>
        <p className="mt-4 font-mono text-[11px] text-fg-subtle">{t("note")}</p>
      </div>
      <HeroCollage />
    </Section>
  );
}

function HeroCollage() {
  const t = useTranslations("talents.hero");
  // The four faces are locale-matched: /fr, /en and /es show three different
  // sets. Captions live in messages beside them, because they describe THOSE
  // photos — a caption naming someone the image does not show is a lie in the
  // visible text, and the source filenames are not trustworthy on that point
  // (see tools/assets/portraits.ts).
  const locale = toLocale(useLocale());
  const portraits = PORTRAITS[locale].hero;
  // t.raw does NOT throw on a missing key — use-intl returns the key path as a
  // string. Every other t.raw in this file is consumed with .map(), which turns
  // that into a loud TypeError at build. This one is indexed, so `captions[0]`
  // would quietly be "c", `captions[1]` "o" — four one-letter captions under
  // four faces, shipped with no error anywhere. The guard makes the two failure
  // modes (wrong type, wrong length) loud at build instead of silent in prod.
  const raw = t.raw("collage");
  if (!Array.isArray(raw) || raw.length !== portraits.length) {
    throw new Error(
      `talents.hero.collage must be an array of ${portraits.length} captions ` +
        `for locale "${locale}" — got ${JSON.stringify(raw)?.slice(0, 80)}`
    );
  }
  const captions = raw as string[];

  return (
    <div className="grid grid-cols-2 gap-3">
      {portraits.map((src, i) => (
        <figure
          key={i}
          className={cn(
            "relative overflow-hidden rounded-sedan-xl bg-surface-2",
            i === 1 && "translate-y-5",
            i === 2 && "-translate-y-5"
          )}
        >
          <Image
            src={src}
            alt=""
            sizes="(min-width: 768px) 22vw, 45vw"
            className="aspect-[4/5] w-full object-cover"
            priority={i < 2}
          />
          <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-8 font-mono text-[11px] text-white">
            {captions[i]}
          </figcaption>
        </figure>
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
    <Section tone="band" rhythm="none" innerClassName="grid gap-6 py-6 md:grid-cols-3">
      {items.map(({ key, Icon }) => (
        <div key={key} className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-sedan bg-accent-soft text-accent">
            <Icon className="size-4.5" />
          </span>
          <div>
            <p className="text-[15px] font-semibold">{t(`${key}.title`)}</p>
            <p className="text-sm text-fg-muted">{t(`${key}.body`)}</p>
          </div>
        </div>
      ))}
    </Section>
  );
}

function Why() {
  const t = useTranslations("talents.why");
  const items = t.raw("items") as Item[];
  return (
    <Section rhythm="major">
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <h2 className="mt-4 max-w-[20ch] text-[clamp(26px,3.8vw,44px)] font-bold leading-[1.05] tracking-[-0.02em]">
        {t("title")}
      </h2>
      <p className="mt-4 max-w-[68ch] leading-relaxed text-fg-muted">
        {t("lead")}
      </p>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => {
          const Icon = WHY_ICONS[i % WHY_ICONS.length];
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

/**
 * The response-rate claim. New with the redesign — the mockups place it between
 * "why" and "steps", and it carries a deliberate disclaimer: it is a method
 * objective, not a measured guarantee, and the copy says so on the page.
 */
function ResponseRate() {
  const t = useTranslations("talents.responseRate");
  return (
    <Section rhythm="none" innerClassName="pb-[clamp(24px,4vw,48px)]">
      <InverseBand>
        <h2 className="mx-auto max-w-[22ch] text-[clamp(26px,3.8vw,44px)] font-bold leading-[1.05] tracking-[-0.02em]">
          {t("title")}
        </h2>
        <p className="mx-auto mt-5 max-w-[62ch] leading-relaxed text-fg-inverse-muted">
          {t("body")}
        </p>
        <Eyebrow className="mt-6 block text-fg-inverse-muted">
          {t("disclaimer")}
        </Eyebrow>
      </InverseBand>
    </Section>
  );
}

function Steps() {
  const t = useTranslations("talents.steps");
  const items = t.raw("items") as Item[];
  return (
    <Section rhythm="major">
      <h2 className="max-w-[22ch] text-[clamp(26px,3.8vw,44px)] font-bold leading-[1.05] tracking-[-0.02em]">
        {t("title")}
      </h2>
      <ol className="mt-10 grid gap-4 md:grid-cols-5">
        {items.map((item, i) => {
          const Icon = STEP_ICONS[i % STEP_ICONS.length];
          return (
            <li
              key={item.title}
              className="rounded-sedan-lg border border-border bg-surface p-5"
            >
              <div className="flex items-center gap-2 text-accent">
                <span className="font-mono text-[18px] font-bold">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Icon className="size-4" />
              </div>
              <h3 className="mt-3 text-[15px] font-bold leading-tight">
                {item.title}
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
                {item.body}
              </p>
            </li>
          );
        })}
      </ol>
      <Button asChild variant="secondary" className="mt-8">
        <Link href="/talents/comment-ca-marche">
          {t("cta")} <ArrowRight />
        </Link>
      </Button>
    </Section>
  );
}

function SelfTape() {
  const t = useTranslations("talents.selftape");
  return (
    <Section tone="band" rhythm="band">
      <div className="grid gap-10 md:grid-cols-2 md:items-center">
        <div>
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="mt-4 text-[clamp(24px,3.2vw,38px)] font-bold leading-[1.08] tracking-[-0.02em]">
            {t("title")}
          </h2>
          <p className="mt-4 max-w-[58ch] leading-relaxed text-fg-muted">
            {t("body")}
          </p>
          <p className="mt-4 flex items-start gap-2.5 rounded-sedan-lg border border-border bg-surface p-4 text-[14px] leading-relaxed text-fg-muted">
            <Video className="mt-0.5 size-4 shrink-0 text-accent" />
            {t("offline")}
          </p>
          <Button asChild className="mt-6">
            <Link href="/talents/comment-ca-marche">
              {t("cta")} <ArrowRight />
            </Link>
          </Button>
        </div>
        {/* Was written with bg-noirchaud / border-creme, which render nothing:
            @theme inline exposes roles only, so this panel was invisible. */}
        <div className="relative aspect-[9/11] overflow-hidden rounded-sedan-2xl bg-surface-inverse">
          <div className="absolute inset-4 rounded-sedan-xl border-2 border-dashed border-border-inverse" />
          <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 font-mono text-[11px] text-white">
            <Video className="size-3.5" />
            {t("hint")}
          </div>
        </div>
      </div>
    </Section>
  );
}

/**
 * The commission rail. Figures are read straight from `talents.pricing.plans`,
 * which already carries the exact values the mockups show — no second source of
 * truth for prices, and no new keys for them. The full four-card grid lives on
 * /talents/tarifs.
 */
function Commission() {
  const t = useTranslations("talents.commission");
  const tp = useTranslations("talents.pricing");
  const plans = tp.raw("plans") as Plan[];
  return (
    <Section id="tarifs" rhythm="major">
      <div className="grid gap-10 md:grid-cols-2 md:items-center">
        <div>
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="mt-4 text-[clamp(24px,3.2vw,38px)] font-bold leading-[1.08] tracking-[-0.02em]">
            {t("title")}
          </h2>
          <p className="mt-4 max-w-[56ch] leading-relaxed text-fg-muted">
            {t("body")}
          </p>
          <Button asChild variant="secondary" className="mt-6">
            <Link href="/talents/tarifs">
              {t("cta")} <ArrowRight />
            </Link>
          </Button>
        </div>
        <ul className="overflow-hidden rounded-sedan-xl border border-border">
          {plans.map((plan, i) => {
            const best = i === plans.length - 1;
            return (
              <li
                key={plan.name}
                className={cn(
                  "grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-4",
                  best
                    ? "bg-surface-inverse text-fg-inverse"
                    : "border-b border-border bg-surface"
                )}
              >
                <span className="text-[15px] font-semibold">{plan.name}</span>
                <span
                  className={cn(
                    "font-mono text-[13px]",
                    best ? "text-fg-inverse-muted" : "text-fg-muted"
                  )}
                >
                  {plan.price}
                </span>
                <span className="w-14 text-right font-mono text-[15px] font-bold">
                  {plan.commission}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}

function Testimonials() {
  const t = useTranslations("talents.testimonials");
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

function Minors() {
  const t = useTranslations("talents.minors");
  const items = t.raw("items") as string[];
  return (
    <Section rhythm="major">
      <div className="grid gap-8 rounded-sedan-2xl border border-success/30 bg-surface p-[clamp(24px,4vw,44px)] md:grid-cols-[1fr_1.15fr]">
        {/* min-w-0: a grid item defaults to min-width:auto, so the long CTA
            label below (whitespace-nowrap) would otherwise widen this column
            past the viewport on a phone. */}
        <div className="min-w-0">
          <span className="flex size-12 items-center justify-center rounded-sedan bg-success/10 text-success">
            <ShieldCheck className="size-6" />
          </span>
          <h2 className="mt-5 text-[clamp(22px,3vw,32px)] font-bold leading-[1.1] tracking-[-0.02em]">
            {t("title")}
          </h2>
          <p className="mt-4 leading-relaxed text-fg-muted">{t("body")}</p>
          <Button
            asChild
            variant="secondary"
            className="mt-6 h-auto whitespace-normal py-3 text-left"
          >
            <Link href="/talents/comment-ca-marche">
              {t("cta")} <ArrowRight />
            </Link>
          </Button>
        </div>
        <ul className="grid min-w-0 content-start gap-2.5">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-[14.5px]">
              <Check className="mt-0.5 size-4 shrink-0 text-success" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function FinalCta() {
  const t = useTranslations("talents.finalCta");
  return (
    <Section width="narrow" rhythm="major">
      <InverseBand>
        <h2 className="mx-auto max-w-[20ch] text-[clamp(26px,3.8vw,44px)] font-bold leading-[1.05] tracking-[-0.02em]">
          {t("title")}
        </h2>
        <p className="mx-auto mt-4 max-w-[54ch] leading-relaxed text-fg-inverse-muted">
          {t("body")}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/talents/inscription">
              {t("ctaPrimary")} <ArrowRight />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="border-border-inverse bg-transparent text-fg-inverse hover:bg-fg-inverse/10"
          >
            <Link href="/talents/faq">{t("ctaSecondary")}</Link>
          </Button>
        </div>
      </InverseBand>
    </Section>
  );
}
