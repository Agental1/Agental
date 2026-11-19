import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Check, ChevronDown } from "lucide-react";
import { seo, jsonLd, serviceLd } from "@/lib/seo";
import { LimelightContactForm } from "@/components/talents/limelight-contact-form";
import { SampleSite } from "@/components/talents/sample-site";
import { LIMELIGHT } from "@/domain/limelight";
import { cn } from "@/lib/utils";

/**
 * Limelight by Agental: websites for performers who do not have one.
 *
 * The page shows what you get before it asks for anything:
 *   1. A sample performer site in a desktop and a phone frame, with how it
 *      works in three short points.
 *   2. "Start your site": the two offers, then the form
 *      (actions/limelight.ts forwards it to n8n once the webhook is set).
 *   3. Questions, behind expanders.
 *
 * The sample performer is fictional and shown with initials: there are no
 * photos of people on public pages. Prices come from `src/domain/limelight.ts`.
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
      <Preview />
      <Start />
      <Faq />
    </>
  );
}

/* --------------------------------------------------------------- preview -- */

function Preview() {
  const t = useTranslations("talents.limelight.hero");
  const th = useTranslations("talents.limelight.how");
  const tf = useTranslations("talents.limelight.frame");
  const steps = th.raw("steps") as { title: string; body: string }[];

  return (
    <section className="mx-auto max-w-site px-[clamp(16px,3vw,40px)] pb-[clamp(40px,5vw,72px)] pt-[clamp(32px,5vw,72px)]">
      {/* On a phone: title, the preview, then the three points. On a desktop
          the preview sits beside both. */}
      <div className="grid gap-x-[clamp(32px,5vw,64px)] gap-y-[clamp(24px,3vw,36px)] lg:grid-cols-[1fr_1.15fr] lg:items-center">
        <div className="lg:self-end">
          <h1 className="display-xl max-w-[9ch]">{t("title")}</h1>
          <p className="mt-4 max-w-[46ch] text-[17px] leading-relaxed text-fg-muted">{t("note")}</p>
        </div>

        <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
          <h2 className="text-[1.25rem]">{th("title")}</h2>
          <ol className="mt-3 space-y-2">
            {steps.map((step, i) => (
              <li key={step.title}>
                <details name="limelight-how" className="group">
                  <summary className="pressable flex min-h-12 items-center gap-3 rounded-sedan-lg border border-border bg-surface px-4 py-2.5 [--hover-scale:1.015] [--press-scale:1.03] group-open:border-accent">
                    <span
                      aria-hidden="true"
                      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[14px] font-bold tabular-nums text-accent"
                    >
                      {i + 1}
                    </span>
                    <span className="flex-1 font-bold leading-snug">{step.title}</span>
                    <ChevronDown
                      aria-hidden="true"
                      className="size-4 shrink-0 text-fg-subtle transition-transform duration-200 group-open:rotate-180"
                    />
                  </summary>
                  <p className="enter px-4 pb-1 pt-2.5 text-[15px] leading-relaxed text-fg-muted">{step.body}</p>
                </details>
              </li>
            ))}
          </ol>
        </div>

        {/* What you get: the same sample site, on a desktop and on a phone. */}
        <figure className="row-start-2 min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="grid grid-cols-[1fr_31%] items-end gap-3 sm:relative sm:block sm:pb-12 sm:pr-[19%]">
            <div className="ll-frame">
              <div className="flex items-center gap-3 border-b border-border bg-surface-2 px-4 py-2.5">
                <span aria-hidden="true" className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-border-strong/50" />
                  <span className="size-2.5 rounded-full bg-border-strong/50" />
                  <span className="size-2.5 rounded-full bg-border-strong/50" />
                </span>
                <span className="min-w-0 flex-1 truncate rounded-full bg-surface px-3 py-1 text-[12.5px] text-fg-muted">
                  {tf("address")}
                </span>
              </div>
              <SampleSite />
            </div>
            <div className="overflow-hidden rounded-[1.5rem] border-[5px] sm:absolute sm:bottom-0 sm:right-0 sm:w-[27%] sm:min-w-[124px] sm:rounded-[1.75rem] sm:border-[6px] border-[var(--ink)] bg-[var(--ink)] shadow-[0_24px_48px_-24px_rgb(11_15_26/0.6)]">
              <div className="overflow-hidden rounded-[1.25rem]">
                <SampleSite compact />
              </div>
            </div>
          </div>
          <figcaption className="mt-3 text-[13px] text-fg-subtle">{tf("caption")}</figcaption>
        </figure>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- start -- */

function Start() {
  const t = useTranslations("talents.limelight");
  const tc = useTranslations("common.pricing");
  const locale = useLocale();
  const plans = ["essential", "signature"] as const;
  const usd = (amount: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    }).format(amount);

  return (
    <section id="start" className="scroll-mt-24 border-t border-border bg-surface/70">
      <div className="mx-auto max-w-site px-[clamp(16px,3vw,40px)] py-[clamp(48px,6vw,88px)]">
        <h2 className="display-md">{t("contact.title")}</h2>
        <p className="mt-3 max-w-[64ch] text-fg-muted">{t("offers.lead")}</p>

        <div className="mt-6 grid gap-[clamp(24px,3vw,48px)] lg:grid-cols-[1fr_1.1fr]">
          <div id="offers" className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {plans.map((key) => {
              const highlighted = key === "signature";
              const features = t.raw(`offers.${key}.features`) as string[];
              return (
                <article
                  key={key}
                  className={cn(
                    "flex flex-col rounded-sedan-xl border bg-surface p-5",
                    highlighted ? "accent-wash border-accent" : "border-border"
                  )}
                >
                  <h3 className="text-[1.25rem] leading-none">{t(`offers.${key}.name`)}</h3>
                  <p className="mt-1.5 text-[14.5px] text-fg-muted">{t(`offers.${key}.summary`)}</p>
                  <p className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-[2rem] font-bold leading-none tracking-[-0.03em] tabular-nums">
                      {usd(LIMELIGHT.plans[key].priceUsd)}
                    </span>
                    <span className="text-[14px] text-fg-muted">{t("offers.oneTime")}</span>
                  </p>
                  <details className="group mt-4 border-t border-border pt-1">
                    <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-sedan text-[14px] font-bold text-accent">
                      {tc("details")}
                      <ChevronDown
                        aria-hidden="true"
                        className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180"
                      />
                    </summary>
                    <ul className="enter space-y-2 pb-2 pt-1">
                      {features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-[14px] leading-snug text-fg-muted">
                          <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <p className="pb-1 text-[13px] leading-relaxed text-fg-subtle">{t(`offers.${key}.renewal`)}</p>
                  </details>
                </article>
              );
            })}
            <p className="text-[13px] text-fg-subtle sm:col-span-2 lg:col-span-1 xl:col-span-2">
              {t("offers.usd")} {t("footerNote")}
            </p>
          </div>

          <div>
            <p className="mb-4 max-w-[52ch] text-[15px] text-fg-muted">{t("contact.lead")}</p>
            <LimelightContactForm />
          </div>
        </div>
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
      <div className="mx-auto grid max-w-site gap-10 px-[clamp(16px,3vw,40px)] py-[clamp(48px,6vw,88px)] lg:grid-cols-[1fr_1.4fr]">
        <h2 className="display-md max-w-[12ch]">{t("title")}</h2>
        <div className="border-t border-border">
          {items.map((item) => (
            <details key={item.q} className="ll-faq group border-b border-border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[17px] font-bold">
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
