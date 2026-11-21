"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Play } from "lucide-react";
import { TemplateArt } from "@/components/talents/template-art";
import type { LimelightTemplateId } from "@/data/limelight-templates";
import { cn } from "@/lib/utils";

type Credit = { role: string; billing: string; title: string; year: string; kind: string };

/**
 * Each template's palette for the explorable part of the sample. The header
 * art comes from TemplateArt; this keeps the tabs and panels in the same look.
 */
const THEMES: Record<
  LimelightTemplateId,
  { page: string; card: string; muted: string; accent: string; tab: string; tabActive: string; reel: string }
> = {
  marquee: {
    page: "bg-[linear-gradient(160deg,var(--night-top),var(--night-bottom))] text-white",
    card: "border-white/15 bg-white/5",
    muted: "text-white/75",
    accent: "text-[var(--blue-lift)]",
    tab: "text-white/80 hover:bg-white/10",
    tabActive: "bg-white text-[var(--ink)]",
    reel: "bg-black/40",
  },
  "contact-sheet": {
    page: "bg-white text-[var(--ink)]",
    card: "border-[color:var(--border)] bg-[var(--day-mid)]",
    muted: "text-[var(--slate)]",
    accent: "text-[var(--blue-deep)]",
    tab: "text-[var(--slate)] hover:bg-[var(--day-mid)]",
    tabActive: "bg-[var(--ink)] text-white",
    reel: "bg-[var(--day-bottom)]",
  },
  "reel-first": {
    page: "bg-[linear-gradient(135deg,var(--blue),var(--blue-night))] text-white",
    card: "border-white/20 bg-white/10",
    muted: "text-white/85",
    accent: "text-white",
    tab: "text-white/85 hover:bg-white/15",
    tabActive: "bg-white text-[var(--blue-night)]",
    reel: "bg-black/30",
  },
  "stage-door": {
    page: "bg-[var(--ink)] text-white",
    card: "border-white/15 bg-white/5",
    muted: "text-[var(--mist)]",
    accent: "text-[var(--blue-lift)]",
    tab: "text-[var(--mist)] hover:bg-white/10",
    tabActive: "bg-white text-[var(--ink)]",
    reel: "bg-white/5",
  },
  "voice-booth": {
    page: "bg-[var(--day-bottom)] text-[var(--ink)]",
    card: "border-[color:var(--border)] bg-white/70",
    muted: "text-[var(--slate)]",
    accent: "text-[var(--blue-deep)]",
    tab: "text-[var(--slate)] hover:bg-white/60",
    tabActive: "bg-[var(--blue)] text-white",
    reel: "bg-white/60",
  },
  studio: {
    page: "bg-[linear-gradient(180deg,#ffffff,var(--day-bottom))] text-[var(--ink)]",
    card: "border-[color:var(--border)] bg-white",
    muted: "text-[var(--slate)]",
    accent: "text-[var(--blue-deep)]",
    tab: "text-[var(--slate)] hover:bg-white",
    tabActive: "bg-[var(--ink)] text-white",
    reel: "bg-[var(--day-mid)]",
  },
};

const TABS = ["overview", "credits", "reel"] as const;
type Tab = (typeof TABS)[number];

/**
 * The fictional sample portfolio, Maya Okafor, in any Limelight template.
 *
 * Every template shows the same profile data so visitors can compare layouts.
 * Overview, Credits and Reel are tabs (arrow keys move between them). There
 * is no photo of a real person: initials, type and color stand in for the
 * headshot, and the reel area is a labeled layout preview.
 */
export function SamplePortfolio({
  template,
  headingLevel = "h2",
  className,
}: {
  template: LimelightTemplateId;
  /** h1 on the standalone sample page, h2 inside a dialog. */
  headingLevel?: "h1" | "h2";
  className?: string;
}) {
  const t = useTranslations("talents.limelight.sample");
  const [tab, setTab] = useState<Tab>("overview");
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ overview: null, credits: null, reel: null });
  const id = useId();
  const theme = THEMES[template];
  const credits = t.raw("credits") as Credit[];
  const Heading = headingLevel;

  function onKey(e: React.KeyboardEvent, current: Tab) {
    const i = TABS.indexOf(current);
    let next: Tab | null = null;
    if (e.key === "ArrowRight") next = TABS[(i + 1) % TABS.length];
    if (e.key === "ArrowLeft") next = TABS[(i - 1 + TABS.length) % TABS.length];
    if (e.key === "Home") next = TABS[0];
    if (e.key === "End") next = TABS[TABS.length - 1];
    if (!next) return;
    e.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <article className={cn("overflow-hidden rounded-sedan-xl", theme.page, className)}>
      <div className="grid gap-[clamp(16px,3vw,32px)] p-[clamp(16px,3vw,32px)] md:grid-cols-[0.9fr_1.1fr]">
        <div className="min-w-0">
          <div className="overflow-hidden rounded-sedan-lg ring-1 ring-black/10">
            <TemplateArt template={template} name={t("name")} headline={t("role")} />
          </div>
          <p className="mt-3 inline-flex rounded-full bg-black/25 px-3 py-1 text-[12.5px] font-bold text-white">
            {t("label")}
          </p>
        </div>

        <div className="min-w-0">
          <Heading className="text-[clamp(1.75rem,2.4vw+1rem,2.75rem)] leading-[1.02] tracking-[-0.03em]">
            {t("name")}
          </Heading>
          <p className={cn("mt-1.5 font-bold", theme.accent)}>{t("role")}</p>

          <div role="tablist" aria-label={t("name")} className="mt-5 flex flex-wrap gap-1.5">
            {TABS.map((key) => (
              <button
                key={key}
                ref={(el) => {
                  tabRefs.current[key] = el;
                }}
                type="button"
                role="tab"
                id={`${id}-tab-${key}`}
                aria-selected={tab === key}
                aria-controls={`${id}-panel-${key}`}
                tabIndex={tab === key ? 0 : -1}
                onClick={() => setTab(key)}
                onKeyDown={(e) => onKey(e, key)}
                className={cn(
                  "pressable inline-flex h-10 items-center rounded-full px-4 text-[14.5px] font-bold [--hover-scale:1.03] [--press-scale:1.05]",
                  tab === key ? theme.tabActive : theme.tab
                )}
              >
                {t(`tabs.${key}`)}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            id={`${id}-panel-${tab}`}
            aria-labelledby={`${id}-tab-${tab}`}
            className="enter mt-5"
          >
            {tab === "overview" && (
              <div className="space-y-4">
                <p className={cn("max-w-[56ch] leading-relaxed", theme.muted)}>{t("bio")}</p>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div className={cn("rounded-sedan border px-4 py-3", theme.card)}>
                    <dt className={cn("text-[13px]", theme.muted)}>{t("languagesLabel")}</dt>
                    <dd className="mt-0.5 font-bold">{t("languages")}</dd>
                  </div>
                  <div className={cn("rounded-sedan border px-4 py-3", theme.card)}>
                    <dt className={cn("text-[13px]", theme.muted)}>{t("resumeLabel")}</dt>
                    <dd className="mt-0.5 font-bold">{t("resume")}</dd>
                  </div>
                </dl>
                <div className={cn("rounded-sedan border px-4 py-3", theme.card)}>
                  <p className="font-bold">{t("contact")}</p>
                  <p className={cn("mt-0.5 text-[14px]", theme.muted)}>{t("contactNote")}</p>
                </div>
              </div>
            )}

            {tab === "credits" && (
              <ul className="space-y-2">
                {credits.map((c) => (
                  <li key={c.title} className={cn("rounded-sedan border px-4 py-3", theme.card)}>
                    <p className="font-bold">
                      <cite className="not-italic">{c.title}</cite>
                    </p>
                    <p className="mt-0.5 text-[14.5px]">
                      {c.role}, {c.billing.toLowerCase()}
                    </p>
                    <p className={cn("text-[13.5px]", theme.muted)}>
                      {c.kind}, {c.year}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {tab === "reel" && (
              <figure>
                <div
                  className={cn(
                    "flex aspect-video items-center justify-center rounded-sedan-lg border",
                    theme.card,
                    theme.reel
                  )}
                >
                  <span className="flex size-14 items-center justify-center rounded-full bg-white text-[var(--ink)]">
                    <Play aria-hidden="true" className="size-6 translate-x-0.5 fill-current" />
                  </span>
                </div>
                <figcaption className={cn("mt-2 text-[14px]", theme.muted)}>{t("reelLayout")}</figcaption>
              </figure>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
