import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Play } from "lucide-react";
import { seo, jsonLd, serviceLd } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { NumberedSteps } from "@/components/marketing/blocks";
import { LimelightContactForm } from "@/components/talents/limelight-contact-form";
import { PORTRAITS, type LocalePortraits } from "@/data/portraits";
import { LIMELIGHT } from "@/domain/limelight";
import { cn } from "@/lib/utils";

/**
 * Limelight by Agental: websites for performers who do not have one.
 *
 * Phase 1 (2026-11): the page, the two offers and the "Start your site" form,
 * which forwards to n8n once its webhook is configured (actions/limelight.ts).
 * The upload intake, previews and checkout come in phase 2.
 *
 * Motion, all scroll-driven and optional (globals.css, "Limelight"):
 *   - the sample site in the browser frame builds itself over the first
 *     screen of scroll,
 *   - the template strip slides sideways while its section is pinned.
 *
 * Every face is from the team's illustrative portrait set, labelled as a
 * fictional performer. Minors are left out: V1 serves adults only.
 */

const PATH = `/talents/${LIMELIGHT.slug}`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "talents.limelight" });
  return seo({
    locale,
    path: PATH,
    title: t("meta.title"),
    description: t("meta.description"),
  });
}

export default async function LimelightPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "talents.limelight" });
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            serviceLd({
              locale,
              path: PATH,
              name: t("meta.title"),
              description: t("meta.description"),
            })
          ),
        }}
      />
      <Hero />
      <How />
      <Templates />
      <Offers />
      <Faq />
      <Contact />
    </>
  );
}

function HitMark() {
  return <span aria-hidden="true" className="hit-mark" />;
}

/* ------------------------------------------------------------------ hero -- */

function Hero() {
  const t = useTranslations("talents.limelight.hero");
  const tf = useTranslations("talents.limelight.frame");
  const portraits = PORTRAITS[toLocale(useLocale())];

  return (
    <section className="overflow-hidden">
      <div className="mx-auto grid max-w-site gap-[clamp(40px,5vw,72px)] px-[clamp(16px,3vw,40px)] pb-[clamp(56px,7vw,104px)] pt-[clamp(40px,6vw,88px)] lg:grid-cols-[1fr_1.08fr] lg:items-center">
        <div>
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h1 className="display-lg mt-6 max-w-[8ch]">{t("title")}</h1>
          <p className="mt-7 max-w-[52ch] text-[clamp(17px,1.5vw,19px)] leading-relaxed text-fg-muted">
            {t("subtitle")}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <a href="#start">{t("ctaPrimary")}</a>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <a href="#offers">{t("ctaSecondary")}</a>
            </Button>
          </div>
          <p className="mt-4 text-[13.5px] text-fg-subtle">{t("note")}</p>
        </div>

        <figure className="min-w-0">
          <div data-assemble className="ll-frame">
            {/* Browser chrome. */}
            <div className="flex items-center gap-3 border-b border-black/10 bg-[#f4f1ea] px-4 py-3">
              <span aria-hidden="true" className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-black/15" />
                <span className="size-2.5 rounded-full bg-black/15" />
                <span className="size-2.5 rounded-full bg-black/15" />
              </span>
              <span className="flex min-w-0 flex-1 items-center rounded-[6px] bg-white px-3 py-1.5 text-[12.5px] text-[#4a4a44]">
                <span className="ll-address truncate">{tf("address")}</span>
              </span>
            </div>

            {/* The sample site: a fictional performer on the "Marquee" template. */}
            <div className="ll-site relative grid grid-cols-[0.95fr_1.05fr] gap-0 bg-[#1e2230] text-[#f4efe6]">
              <div className="ll-headshot relative aspect-[4/5]">
                <Image
                  src={portraits.hero[1]}
                  alt=""
                  fill
                  priority
                  sizes="(min-width: 1024px) 26vw, 46vw"
                  className="object-cover object-top"
                />
              </div>
              <div className="flex min-w-0 flex-col justify-between p-[clamp(16px,2.2vw,28px)]">
                <nav aria-hidden="true" className="flex justify-end gap-4 text-[11px] text-[#f4efe6]/65">
                  <span>{tf("resume")}</span>
                  <span>{tf("contact")}</span>
                </nav>
                <div>
                  <p className="ll-name text-[clamp(2.1rem,4.4vw,4rem)] uppercase leading-[0.86]">
                    {tf("name")}
                  </p>
                  <p className="mt-3 text-[13px] text-[#e9c46a]">{tf("role")}</p>
                  <p className="mt-2 max-w-[28ch] text-[12.5px] leading-snug text-[#f4efe6]/70">
                    {tf("line")}
                  </p>
                </div>
                <div className="ll-reel relative mt-4 aspect-video overflow-hidden rounded-[6px]">
                  <Image
                    src={portraits.hero[1]}
                    alt=""
                    fill
                    sizes="220px"
                    className="object-cover object-[50%_20%] brightness-[0.7]"
                  />
                  <span className="absolute inset-0 flex items-center justify-center gap-2 text-[12px] font-medium">
                    <span className="flex size-9 items-center justify-center rounded-full bg-[#e9c46a] text-[#1e2230]">
                      <Play className="size-4 translate-x-px fill-current" />
                    </span>
                    {tf("reel")}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <figcaption className="mt-3 flex flex-wrap justify-between gap-x-6 gap-y-1 text-[12.5px] text-fg-subtle">
            <span>{tf("caption")}</span>
            <span className="ll-hint">{t("scrollHint")}</span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- how -- */

function How() {
  const t = useTranslations("talents.limelight.how");
  const steps = t.raw("steps") as { title: string; body: string }[];
  return (
    <section className="border-t border-border bg-surface">
      <div className="mx-auto max-w-site px-[clamp(16px,3vw,40px)] py-[clamp(64px,8vw,120px)]">
        <h2 className="display-md max-w-[16ch]">{t("title")}</h2>
        <HitMark />
        <NumberedSteps items={steps} className="mt-[clamp(32px,4vw,56px)]" />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- templates -- */

type Tpl = { name: string; fit: string; performer: string; role: string };

/**
 * Six sample sites, drawn in HTML so they stay sharp and translate. Each has
 * its own palette on purpose: a performer's site wears its own colours.
 */
function TemplateCard({
  tpl,
  index,
  portraits,
}: {
  tpl: Tpl;
  index: number;
  portraits: LocalePortraits;
}) {
  const photo = (src: StaticImageData, className?: string, pos = "object-top") => (
    <Image src={src} alt="" fill sizes="(min-width: 1024px) 22vw, 70vw" className={cn("object-cover", pos, className)} />
  );

  const designs: React.ReactNode[] = [
    // Marquee
    <div key="marquee" className="relative h-full bg-[#1e2230] text-[#f4efe6]">
      {photo(portraits.hero[1], "opacity-80")}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#1e2230] via-[#1e2230]/80 to-transparent p-5 pt-16">
        <p className="text-[2.6rem] font-extrabold uppercase leading-[0.85]">{tpl.performer}</p>
        <p className="mt-2 text-[12px] text-[#e9c46a]">{tpl.role}</p>
      </div>
    </div>,
    // Contact sheet: one session, four crops.
    <div key="sheet" className="flex h-full flex-col bg-[#fafaf7] p-4 text-[#111]">
      <p className="text-[15px] font-semibold tracking-[-0.02em]">{tpl.performer}</p>
      <p className="text-[11px] text-black/55">{tpl.role}</p>
      <div className="mt-3 grid flex-1 grid-cols-2 gap-1.5">
        {["object-[50%_15%]", "object-[30%_25%]", "object-[70%_30%]", "object-[50%_60%]"].map((pos) => (
          <span key={pos} className="relative block overflow-hidden">
            {photo(portraits.ages["jeune-adulte"], "", pos)}
          </span>
        ))}
      </div>
    </div>,
    // Reel first
    <div key="reel" className="relative h-full bg-[#101614] text-white">
      {photo(portraits.hero[2], "brightness-[0.62]")}
      <span className="absolute left-1/2 top-[42%] flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#f2c14e] text-[#101614]">
        <Play className="size-5 translate-x-px fill-current" />
      </span>
      <div className="absolute inset-x-0 bottom-0 p-5">
        <p className="text-[20px] font-semibold tracking-[-0.03em]">{tpl.performer}</p>
        <p className="text-[12px] text-white/70">{tpl.role}</p>
      </div>
    </div>,
    // Stage door
    <div key="stage" className="flex h-full flex-col bg-[#5b1f2a] p-5 text-[#f6ead8]">
      <span className="relative block aspect-square w-[58%] overflow-hidden rounded-[2px]">
        {photo(portraits.ages.senior)}
      </span>
      <p className="mt-4 text-[2.1rem] font-bold uppercase leading-[0.9]">{tpl.performer}</p>
      <p className="mt-1 text-[11.5px] text-[#f6ead8]/70">{tpl.role}</p>
      <div aria-hidden="true" className="mt-auto space-y-2 border-t border-[#f6ead8]/25 pt-3">
        <span className="block h-1.5 w-[80%] rounded-full bg-[#f6ead8]/30" />
        <span className="block h-1.5 w-[64%] rounded-full bg-[#f6ead8]/30" />
        <span className="block h-1.5 w-[72%] rounded-full bg-[#f6ead8]/30" />
      </div>
    </div>,
    // Voice booth
    <div key="voice" className="flex h-full flex-col bg-[#e6edf1] p-5 text-[#14232e]">
      <div className="flex items-center gap-3">
        <span className="relative block size-12 overflow-hidden rounded-full">{photo(portraits.ages["senior-plus"])}</span>
        <div>
          <p className="text-[15px] font-semibold tracking-[-0.02em]">{tpl.performer}</p>
          <p className="text-[11px] text-[#14232e]/60">{tpl.role}</p>
        </div>
      </div>
      <div aria-hidden="true" className="mt-auto space-y-4">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#14232e] text-[#e6edf1]">
              <Play className="size-3.5 translate-x-px fill-current" />
            </span>
            <svg viewBox="0 0 120 24" className="h-6 flex-1 text-[#14232e]/55" preserveAspectRatio="none">
              {Array.from({ length: 30 }, (_, i) => {
                const h = 4 + ((i * 7 + row * 11) % 17);
                return <rect key={i} x={i * 4} y={12 - h / 2} width="2" height={h} rx="1" fill="currentColor" />;
              })}
            </svg>
          </div>
        ))}
      </div>
    </div>,
    // Studio
    <div key="studio" className="flex h-full flex-col bg-white p-4 text-[#1a1a1a]">
      <span className="relative block flex-1 overflow-hidden">{photo(portraits.hero[3])}</span>
      <div className="flex items-end justify-between pt-3">
        <div>
          <p className="text-[18px] font-light tracking-[-0.03em]">{tpl.performer}</p>
          <p className="text-[11px] text-black/50">{tpl.role}</p>
        </div>
        <span aria-hidden="true" className="h-2 w-10 bg-[#2f5bd3]" />
      </div>
    </div>,
  ];

  return (
    <li className="w-[min(72vw,330px)] shrink-0">
      <div className="ll-card aspect-[4/5] overflow-hidden rounded-[6px] border border-black/10 shadow-[0_18px_40px_-28px_rgb(22_32_28/0.5)]">
        {designs[index % designs.length]}
      </div>
      <p className="mt-3 flex items-baseline gap-3 text-[15px] font-semibold">
        <span className="text-[12px] font-normal tabular-nums text-fg-subtle">{String(index + 1).padStart(2, "0")}</span>
        {tpl.name}
      </p>
      <p className="mt-1 pl-7 text-[13.5px] leading-snug text-fg-muted">{tpl.fit}</p>
    </li>
  );
}

function Templates() {
  const t = useTranslations("talents.limelight.templates");
  const items = t.raw("items") as Tpl[];
  const portraits = PORTRAITS[toLocale(useLocale())];
  return (
    <section className="ll-sheet border-t border-border">
      <div className="ll-sheet-pin">
        <div className="mx-auto w-full max-w-site px-[clamp(16px,3vw,40px)]">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
            <div>
              <h2 className="display-md">{t("title")}</h2>
              <HitMark />
            </div>
            <p className="max-w-[52ch] text-[16px] leading-relaxed text-fg-muted">{t("lead")}</p>
          </div>
        </div>
        <div className="ll-sheet-track mt-[clamp(28px,4vw,48px)]">
          <ul className="ll-strip flex w-max gap-[clamp(16px,2vw,28px)] px-[clamp(16px,3vw,40px)]">
            {items.map((tpl, i) => (
              <TemplateCard key={tpl.name} tpl={tpl} index={i} portraits={portraits} />
            ))}
          </ul>
        </div>
        <p className="mx-auto mt-6 w-full max-w-site px-[clamp(16px,3vw,40px)] text-[12px] text-fg-subtle">
          {t("caption")}
        </p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- offers -- */

function Offers() {
  const t = useTranslations("talents.limelight.offers");
  const plans = ["essential", "signature"] as const;
  return (
    <section id="offers" className="scroll-mt-24 border-t border-border bg-surface">
      <div className="mx-auto max-w-site px-[clamp(16px,3vw,40px)] py-[clamp(64px,8vw,120px)]">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
          <div>
            <h2 className="display-md max-w-[14ch]">{t("title")}</h2>
            <HitMark />
          </div>
          <p className="max-w-[52ch] text-[16px] leading-relaxed text-fg-muted">{t("lead")}</p>
        </div>

        <div className="mt-[clamp(36px,5vw,64px)] grid gap-4 md:grid-cols-2">
          {plans.map((key) => {
            const dark = key === "signature";
            const features = t.raw(`${key}.features`) as string[];
            return (
              <article
                key={key}
                className={cn(
                  "flex flex-col rounded-[10px] p-[clamp(24px,3vw,40px)]",
                  dark
                    ? "bg-surface-inverse text-fg-inverse"
                    : "border border-border bg-bg"
                )}
              >
                <h3 className="text-[18px] font-semibold">{t(`${key}.name`)}</h3>
                <p className={cn("mt-1 text-[15px]", dark ? "text-fg-inverse-muted" : "text-fg-muted")}>
                  {t(`${key}.summary`)}
                </p>
                <p className="mt-7 flex items-baseline gap-3">
                  <span className="text-[clamp(4rem,7vw,5.75rem)] font-extrabold leading-[0.8]">
                    {t(`${key}.price`)}
                  </span>
                  <span className={cn("text-[14px]", dark ? "text-fg-inverse-muted" : "text-fg-subtle")}>
                    {t("oneTime")}
                  </span>
                </p>
                <ul className="mt-8 space-y-3 text-[15px]">
                  {features.map((f) => (
                    <li key={f} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className={cn("tape-mark mt-[5px] h-3 w-3.5 shrink-0", dark ? "text-[var(--blue-lift)]" : "text-accent")}
                      />
                      {f}
                    </li>
                  ))}
                </ul>
                <p className={cn("mt-8 text-[13.5px] leading-relaxed", dark ? "text-fg-inverse-muted" : "text-fg-subtle")}>
                  {t(`${key}.renewal`)}
                </p>
                <div className="mt-6 pt-2 md:mt-auto">
                  <Button
                    asChild
                    size="lg"
                    className={cn("w-full sm:w-auto", dark && "bg-[#ffffff] text-[var(--ink)] hover:bg-white")}
                  >
                    <a href="#start">{t(`${key}.cta`)}</a>
                  </Button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-4 flex flex-col gap-4 rounded-[10px] border border-dashed border-border-strong p-[clamp(20px,2.6vw,32px)] md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-[17px] font-semibold">{t("custom.title")}</h3>
            <p className="mt-1 max-w-[60ch] text-[15px] text-fg-muted">{t("custom.body")}</p>
          </div>
          <Button asChild variant="secondary">
            <a href="#start">{t("custom.cta")}</a>
          </Button>
        </div>
        <p className="mt-4 text-[12.5px] text-fg-subtle">{t("usd")}</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- faq -- */

/** Native <details>: opens without JavaScript and keeps heading semantics. */
function Faq() {
  const t = useTranslations("talents.limelight.faq");
  const items = t.raw("items") as { q: string; a: string }[];
  return (
    <section className="border-t border-border">
      <div className="mx-auto grid max-w-site gap-10 px-[clamp(16px,3vw,40px)] py-[clamp(64px,8vw,120px)] lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 className="display-md max-w-[12ch]">{t("title")}</h2>
          <HitMark />
        </div>
        <div className="border-t border-border">
          {items.map((item) => (
            <details key={item.q} className="ll-faq group border-b border-border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
                <h3>{item.q}</h3>
                <span aria-hidden="true" className="relative size-4 shrink-0 text-accent">
                  <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-current" />
                  <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-current transition-transform group-open:scale-y-0" />
                </span>
              </summary>
              <p className="max-w-[62ch] pb-6 text-[15.5px] leading-relaxed text-fg-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- contact -- */

function Contact() {
  const t = useTranslations("talents.limelight");
  return (
    <section id="start" className="scroll-mt-24 border-t border-border bg-surface">
      <div className="mx-auto grid max-w-site gap-[clamp(32px,5vw,72px)] px-[clamp(16px,3vw,40px)] py-[clamp(64px,8vw,120px)] lg:grid-cols-[1fr_1.25fr]">
        <div>
          <h2 className="display-md max-w-[10ch]">{t("contact.title")}</h2>
          <HitMark />
          <p className="mt-6 max-w-[46ch] text-[16.5px] leading-relaxed text-fg-muted">{t("contact.lead")}</p>
          <p className="mt-8 max-w-[46ch] border-l-2 border-accent pl-4 text-[14px] leading-relaxed text-fg-muted">
            {t("footerNote")}
          </p>
        </div>
        <LimelightContactForm />
      </div>
    </section>
  );
}
