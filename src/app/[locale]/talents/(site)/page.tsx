import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";
import { seo, jsonLd, serviceLd } from "@/lib/seo";
import { useTranslations, useLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Check, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { Section } from "@/components/marketing/section";
import { PORTRAITS } from "@/data/portraits";
import {
  FramedCards,
  NumberedSteps,
  QuoteCards,
  SplitWordmark,
  StageCta,
} from "@/components/marketing/blocks";
import { CASTING_TYPES, type CastingTypeSlug } from "@/data/casting-types";
import { cn } from "@/lib/utils";

/**
 * Agental Talents landing — v1 redesign ("Spotlight").
 *
 * Built from the design team's four reference boards:
 *   - Alture: giant split wordmark over a rounded dark hero panel
 *   - Orchard: a works index (category list + edge-to-edge image strip)
 *   - Glow-up: a hairline-framed card grid with one card lifted out
 *   - Metafore: oversized step numerals
 *
 * One loud moment only: the stage panel, a dark set with a followspot and a
 * spike-tape mark on the floor. Everything else stays quiet. Copy is the
 * existing approved copy; claims and legal text are owned outside the dev team
 * (decision log D19–D21) and are not rewritten here.
 */

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

type Item = { title: string; body: string };
type Plan = { name: string; price: string; commission: string };

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
      <Faces />
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

/* ------------------------------------------------------------------ hero -- */

const STAGE_TABS: CastingTypeSlug[] = [
  "figuration",
  "seconds-roles",
  "publicite",
  "voix-doublage",
];

function Hero() {
  const t = useTranslations("talents.hero");
  const tl = useTranslations("talents.landing");
  const tc = useTranslations("talents.castingTypes");
  const tp = useTranslations("talents.proof");
  const portraits = PORTRAITS[toLocale(useLocale())].hero;

  return (
    <section data-demo="talents-hero" className="px-[clamp(12px,2vw,24px)]">
      <div className="mx-auto max-w-site">
        <SplitWordmark portal="Talents" />

        {/* The stage. */}
        <div className="stage-light relative isolate h-[min(88svh,720px)] min-h-[600px] overflow-hidden rounded-sedan-2xl text-[#f2f2ee] md:h-[min(70vh,740px)] md:min-h-[560px]">
          <div className="stage-beam spot-sweep pointer-events-none absolute inset-0 -z-10" />

          {/* The performer, caught in the followspot. */}
          <div
            className="pointer-events-none absolute bottom-0 right-[4%] top-[8%] -z-10 w-[min(62%,560px)] md:right-[23%] md:w-[34%]"
            style={{
              maskImage:
                "radial-gradient(48% 50% at 50% 44%, #000 38%, transparent 100%)",
              WebkitMaskImage:
                "radial-gradient(48% 50% at 50% 44%, #000 38%, transparent 100%)",
            }}
          >
            <Image
              src={portraits[1]}
              alt=""
              fill
              priority
              sizes="(min-width: 768px) 34vw, 62vw"
              className="object-cover object-top brightness-[0.92] saturate-[0.8]"
            />
          </div>
          {/* Spike-tape mark on the floor, where the performer stands. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-[7%] right-[calc(4%+min(31%,280px))] -z-10 md:right-[40%]"
          >
            <span className="absolute h-[6px] w-14 -translate-x-1/2 rotate-[24deg] rounded-[1px] bg-signal shadow-[0_0_18px_rgb(255_83_23/0.6)]" />
            <span className="absolute h-[6px] w-14 -translate-x-1/2 -rotate-[24deg] rounded-[1px] bg-signal shadow-[0_0_18px_rgb(255_83_23/0.6)]" />
          </div>
          <div className="stage-grain pointer-events-none absolute inset-0 -z-10" />

          {/* Casting-type tabs, as on the Alture board. */}
          <nav
            aria-label={tl("faces.typesLabel")}
            className="grid grid-cols-2 gap-x-6 px-[clamp(20px,3vw,40px)] pt-6 md:grid-cols-4"
          >
            {STAGE_TABS.map((slug) => (
              <Link
                key={slug}
                href={`/castings/${slug}`}
                className="flex min-h-11 items-center justify-center border-b border-dashed border-white/25 text-[14px] text-white/80 transition-colors hover:border-white/60 hover:text-white"
              >
                {tc(`${slug}.name`)}
              </Link>
            ))}
          </nav>

          {/* Headline, bottom left. */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-8 p-[clamp(20px,3.5vw,48px)] md:flex-row md:items-end md:justify-between">
            <div className="min-w-0 md:max-w-[55%]">
              <p className="text-[13px] text-white/60">{t("eyebrow")}</p>
              <h1 className="mt-3 max-w-[11ch] text-[clamp(2.4rem,5.4vw,5rem)] font-semibold leading-[0.95] tracking-[-0.05em]">
                {t("title")}{" "}
                <span className="text-white/55">{t("titleEmph")}</span>
              </h1>
            </div>

            {/* Agent card, bottom right. */}
            <div className="hidden w-full max-w-[420px] shrink-0 items-center gap-3 sm:flex rounded-sedan-xl border border-white/15 bg-white/[0.07] p-2.5 backdrop-blur-md md:w-auto">
              <Image
                src={portraits[3]}
                alt=""
                sizes="56px"
                className="size-14 shrink-0 rounded-sedan object-cover object-top"
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[14px] font-medium">
                  <span className="size-1.5 rounded-full bg-signal" />
                  {tl("agentCard.title")}
                </p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-white/60">
                  {tl("agentCard.body")}
                </p>
              </div>
              <Link
                href="/talents/inscription"
                className="inline-flex h-10 shrink-0 items-center rounded-full bg-[#f2f2ee] px-4 text-[14px] font-medium text-[#0e0e0e] transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {t("ctaPrimary")}
              </Link>
            </div>
          </div>
        </div>

        {/* Under the stage: what Agental is, in plain words, and the proof
            strip as three hairline columns. */}
        <div className="grid gap-10 px-[clamp(4px,1vw,16px)] py-[clamp(40px,6vw,88px)] lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="max-w-[40ch] text-[clamp(1.2rem,1.7vw,1.5rem)] font-medium leading-[1.3] tracking-[-0.03em]">
              {t("subtitle")}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/talents/inscription">{t("ctaPrimary")}</Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/talents/comment-ca-marche">{t("ctaSecondary")}</Link>
              </Button>
            </div>
            <p className="mt-4 text-[13px] text-fg-subtle">{t("note")}</p>
          </div>
          <dl className="grid content-start border-t border-border sm:grid-cols-3 sm:border-l sm:border-t-0 lg:self-end">
            {(["regulated", "ai", "free"] as const).map((key) => (
              <div
                key={key}
                className="border-b border-border py-5 sm:border-b-0 sm:border-r sm:px-6 sm:py-1"
              >
                <dt className="text-[16px] font-medium leading-snug tracking-[-0.02em]">
                  {tp(`${key}.title`)}
                </dt>
                <dd className="mt-2 text-[14px] leading-relaxed text-fg-muted">
                  {tp(`${key}.body`)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- faces -- */

/**
 * One tile per casting type, as a contact sheet. The portraits are mapped by
 * hand so no face repeats across the nine tiles.
 */
function facesFor(locale: ReturnType<typeof toLocale>) {
  const p = PORTRAITS[locale];
  const map: Record<CastingTypeSlug, StaticImageData> = {
    figuration: p.ages.adulte,
    silhouette: p.ages["jeune-adulte"],
    "seconds-roles": p.ages.senior,
    publicite: p.hero[1],
    photo: p.hero[2],
    "voix-doublage": p.ages["senior-plus"],
    enfants: p.ages.enfant,
    createurs: p.ages.adolescent,
    performeurs: p.hero[0],
  };
  return map;
}

function Faces() {
  const t = useTranslations("talents.landing.faces");
  const tc = useTranslations("talents.castingTypes");
  const faces = facesFor(toLocale(useLocale()));

  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-site px-[clamp(16px,3vw,40px)] py-[clamp(64px,9vw,136px)]">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
          <h2 className="display-lg max-w-[12ch]">{t("title")}</h2>
          <div className="grid gap-x-10 gap-y-3 self-end text-[14px] sm:grid-cols-[auto_1fr]">
            <p className="text-fg-subtle">{t("typesLabel")}</p>
            <ul className="columns-2 gap-6">
              {CASTING_TYPES.map((type) => (
                <li key={type.slug} className="break-inside-avoid">
                  <Link
                    href={`/castings/${type.slug}`}
                    className="inline-flex min-h-7 items-center text-fg transition-colors hover:text-fg-muted"
                  >
                    {tc(`${type.slug}.name`)}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 max-w-[48ch] sm:col-span-2 text-[15px] leading-relaxed text-fg-muted">
              {t("lead")}
            </p>
          </div>
        </div>

        <ul className="mt-[clamp(40px,6vw,72px)] grid grid-cols-3 gap-[3px] lg:grid-cols-9">
          {CASTING_TYPES.map((type) => (
            <li key={type.slug}>
              <Link href={`/castings/${type.slug}`} className="group block">
                <span className="block overflow-hidden bg-surface-2">
                  <Image
                    src={faces[type.slug]}
                    alt=""
                    sizes="(min-width: 1024px) 11vw, 33vw"
                    className="aspect-[4/5] w-full object-cover grayscale-[35%] transition-[filter] duration-300 group-hover:grayscale-0"
                  />
                </span>
                <span className="mt-2 block text-[12.5px] leading-tight text-fg-muted group-hover:text-fg">
                  {tc(`${type.slug}.name`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[12px] text-fg-subtle">{t("note")}</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- why -- */

function Why() {
  const t = useTranslations("talents.why");
  const items = t.raw("items") as Item[];
  return (
    <section className="border-t border-border bg-surface">
      <div className="mx-auto max-w-site px-[clamp(16px,3vw,40px)] pt-[clamp(64px,9vw,136px)]">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h2 className="display-md mt-6 max-w-[16ch]">{t("title")}</h2>
        <p className="mt-6 max-w-[60ch] text-[17px] leading-relaxed text-fg-muted">
          {t("lead")}
        </p>
      </div>
      <FramedCards items={items} className="mt-[clamp(40px,6vw,72px)]" />
      <div className="h-[clamp(64px,9vw,136px)]" />
    </section>
  );
}

/* --------------------------------------------------------- response rate -- */

function ResponseRate() {
  const t = useTranslations("talents.responseRate");
  return (
    <Section rhythm="major" className="border-t border-border">
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <h2 className="display-lg max-w-[14ch]">{t("title")}</h2>
        <div>
          <p className="text-[17px] leading-relaxed text-fg-muted">{t("body")}</p>
          <p className="mt-5 text-[13px] text-fg-subtle">{t("disclaimer")}</p>
        </div>
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------------- steps -- */

function Steps() {
  const t = useTranslations("talents.steps");
  const items = t.raw("items") as Item[];
  return (
    <Section rhythm="major" className="border-t border-border">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 className="display-md max-w-[14ch]">{t("title")}</h2>
        <Button asChild variant="secondary">
          <Link href="/talents/comment-ca-marche">{t("cta")}</Link>
        </Button>
      </div>
      <NumberedSteps
        data-demo="talents-steps"
        items={items}
        className="mt-[clamp(40px,5vw,64px)]"
      />
    </Section>
  );
}

/* ------------------------------------------------------------- self-tape -- */

function SelfTape() {
  const t = useTranslations("talents.selftape");
  const portraits = PORTRAITS[toLocale(useLocale())].hero;
  return (
    <Section data-demo="talents-selftape" rhythm="major" className="border-t border-border">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="display-md mt-6 max-w-[16ch]">{t("title")}</h2>
          <p className="mt-6 max-w-[56ch] text-[16.5px] leading-relaxed text-fg-muted">
            {t("body")}
          </p>
          <p className="mt-5 max-w-[56ch] border-l-2 border-signal pl-4 text-[14.5px] leading-relaxed text-fg-muted">
            {t("offline")}
          </p>
          <Button asChild className="mt-8">
            <Link href="/talents/comment-ca-marche">{t("cta")}</Link>
          </Button>
        </div>

        {/* Viewfinder: what the studio shows while you record. */}
        <figure className="relative mx-auto aspect-[4/5] w-full max-w-[520px] overflow-hidden rounded-sedan-2xl bg-[#0e0e0e]">
          <Image
            src={portraits[2]}
            alt=""
            fill
            sizes="(min-width: 1024px) 40vw, 90vw"
            className="object-cover object-top opacity-90"
          />
          <div aria-hidden="true" className="absolute inset-0">
            {/* Rule of thirds. */}
            <span className="absolute inset-y-0 left-1/3 border-l border-white/20" />
            <span className="absolute inset-y-0 left-2/3 border-l border-white/20" />
            <span className="absolute inset-x-0 top-1/3 border-t border-white/20" />
            <span className="absolute inset-x-0 top-2/3 border-t border-white/20" />
            {/* Corner brackets. */}
            {[
              "left-5 top-5 border-l-2 border-t-2",
              "right-5 top-5 border-r-2 border-t-2",
              "bottom-5 left-5 border-b-2 border-l-2",
              "bottom-5 right-5 border-b-2 border-r-2",
            ].map((c) => (
              <span key={c} className={cn("absolute size-7 border-white/90", c)} />
            ))}
            {/* Face guide. */}
            <span className="absolute left-1/2 top-[18%] h-[36%] w-[38%] -translate-x-1/2 rounded-[50%] border border-dashed border-white/50" />
          </div>
          <div className="absolute left-5 right-5 top-5 flex items-center justify-between pl-10 pr-10 font-mono text-[11.5px] text-white">
            <span className="flex items-center gap-1.5">
              <span className="size-2 animate-pulse rounded-full bg-signal motion-reduce:animate-none" />
              REC 00:42
            </span>
            <span className="text-white/70">Take 3</span>
          </div>
          <figcaption className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-black/60 px-3.5 py-2 text-[12.5px] text-white backdrop-blur-md">
            <Check className="size-3.5 text-[#8fd19e]" />
            {t("hint")}
          </figcaption>
        </figure>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------ commission -- */

function Commission() {
  const t = useTranslations("talents.commission");
  const tp = useTranslations("talents.pricing");
  const th = useTranslations("talents.landing.commissionHead");
  const plans = tp.raw("plans") as Plan[];
  return (
    <Section id="tarifs" rhythm="major" className="border-t border-border">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.35fr]">
        <div>
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="display-md mt-6 max-w-[14ch]">{t("title")}</h2>
          <p className="mt-6 max-w-[48ch] text-[16.5px] leading-relaxed text-fg-muted">
            {t("body")}
          </p>
          <Button asChild variant="secondary" className="mt-8">
            <Link href="/talents/tarifs">{t("cta")}</Link>
          </Button>
        </div>
        <table className="w-full self-end border-collapse text-left">
          <thead>
            <tr className="border-b border-border text-[13px] text-fg-subtle">
              <th scope="col" className="pb-3 font-normal">{th("plan")}</th>
              <th scope="col" className="pb-3 font-normal">{th("price")}</th>
              <th scope="col" className="pb-3 text-right font-normal">{th("commission")}</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan, i) => {
              const best = i === plans.length - 1;
              return (
                <tr key={plan.name} className="border-b border-border">
                  <th
                    scope="row"
                    className="py-5 text-[clamp(1.1rem,1.6vw,1.35rem)] font-medium tracking-[-0.03em]"
                  >
                    <span className="flex items-center gap-2">
                      {best && <span className="size-2 rounded-full bg-signal" />}
                      {plan.name}
                    </span>
                  </th>
                  <td className="py-5 font-mono text-[14px] text-fg-muted">{plan.price}</td>
                  <td
                    className={cn(
                      "py-5 text-right text-[clamp(2.2rem,4.5vw,3.75rem)] font-semibold leading-none tracking-[-0.06em] tabular-nums",
                      !best && "text-fg/40"
                    )}
                  >
                    {plan.commission}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------- testimonials -- */

function Testimonials() {
  const t = useTranslations("talents.testimonials");
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

/* ---------------------------------------------------------------- minors -- */

function Minors() {
  const t = useTranslations("talents.minors");
  const items = t.raw("items") as string[];
  return (
    <Section rhythm="none" className="pb-[clamp(64px,9vw,136px)]">
      <div className="grid gap-10 rounded-sedan-2xl border border-border bg-surface p-[clamp(24px,4vw,56px)] lg:grid-cols-[1fr_1fr]">
        <div className="min-w-0">
          <ShieldCheck className="size-7 text-success" aria-hidden="true" />
          <h2 className="mt-6 text-[clamp(1.6rem,2.8vw,2.4rem)] font-semibold leading-[1.05] tracking-[-0.045em]">
            {t("title")}
          </h2>
          <p className="mt-5 max-w-[56ch] leading-relaxed text-fg-muted">{t("body")}</p>
          <Button
            asChild
            variant="secondary"
            className="mt-7 h-auto whitespace-normal py-3 text-left"
          >
            <Link href="/talents/comment-ca-marche">{t("cta")}</Link>
          </Button>
        </div>
        <ul className="min-w-0 self-center border-t border-border">
          {items.map((item) => (
            <li
              key={item}
              className="flex items-start gap-3 border-b border-border py-4 text-[15px]"
            >
              <Check className="mt-0.5 size-4 shrink-0 text-success" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------- final cta -- */

function FinalCta() {
  const t = useTranslations("talents.finalCta");
  return (
    <StageCta
      title={t("title")}
      body={t("body")}
      primary={{ href: "/talents/inscription", label: t("ctaPrimary") }}
      secondary={{ href: "/talents/faq", label: t("ctaSecondary") }}
    />
  );
}
