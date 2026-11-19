import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Check, FileSignature, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { toLocale } from "@/i18n/routing";
import { PORTRAITS } from "@/data/portraits";
import { cn } from "@/lib/utils";

type Item = { title: string; body: string };

/**
 * "Joining Agental, in five steps", as something you can click through.
 *
 * Built on native radio inputs: the checked step decides which panel shows
 * (globals.css, "Join steps", via :has()). So it works with the keyboard
 * (arrow keys move between steps), needs no JavaScript and no hydration, and
 * still reads as a plain ordered list to screen readers when CSS is off.
 *
 * Each panel pairs the step's copy with a small illustration of that moment
 * in the product. The illustrations are labelled as such; the performer is
 * from the illustrative portrait set.
 */
export function JoinSteps({ items }: { items: Item[] }) {
  const t = useTranslations("talents.stepsDemo");
  const th = useTranslations("talents.hero");
  const tc = useTranslations("talents.castingTypes");
  const ts = useTranslations("talents.selftape");
  const tf = useTranslations("talents.limelight.frame");
  const portraits = PORTRAITS[toLocale(useLocale())];
  const total = items.length;

  const visuals = [
    // 1. Profile
    <div key="profile" className="join-card">
      <div className="flex items-center gap-4">
        <span className="relative block size-16 shrink-0 overflow-hidden rounded-full">
          <Image src={portraits.hero[1]} alt="" fill sizes="64px" className="object-cover object-top" />
        </span>
        <div className="min-w-0">
          <p className="text-[18px] font-semibold">{tf("name")}</p>
          <p className="text-[13px] text-fg-muted">{tf("role")}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {(["publicite", "seconds-roles", "voix-doublage"] as const).map((slug) => (
          <span key={slug} className="rounded-[4px] bg-accent-soft px-2.5 py-1 text-[12.5px] font-medium text-accent">
            {tc(`${slug}.name`)}
          </span>
        ))}
      </div>
      <p className="mt-6 text-[12.5px] text-fg-subtle">{t("profileStrength")}</p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
        <span className="join-fill block h-full w-[82%] rounded-full bg-accent" />
      </div>
    </div>,
    // 2. Mandate
    <div key="mandate" className="join-card">
      <p className="flex items-center gap-2 text-[15px] font-semibold">
        <FileSignature className="size-4 text-accent" />
        {t("mandateTitle")}
      </p>
      <div aria-hidden="true" className="mt-5 space-y-2.5">
        {["w-full", "w-[92%]", "w-[96%]", "w-[70%]"].map((w) => (
          <span key={w} className={cn("block h-2 rounded-full bg-surface-2", w)} />
        ))}
      </div>
      <div className="mt-7 flex items-end justify-between gap-4 border-t border-border pt-4">
        <p className="font-[family-name:var(--font-marquee)] text-[26px] font-medium italic leading-none">{tf("name")}</p>
        <span className="inline-flex items-center gap-1.5 rounded-[4px] bg-accent px-2.5 py-1 text-[12.5px] font-medium text-accent-fg">
          <Check className="size-3.5" />
          {t("signed")}
        </span>
      </div>
    </div>,
    // 3. The AI works, and waits for the talent's OK before anything is sent.
    <div key="ai" className="join-card">
      <p className="flex items-center gap-2 text-[15px] font-semibold">
        <Sparkles className="size-4 text-accent" />
        {t("aiTitle")}
      </p>
      <ul className="mt-4 divide-y divide-border">
        {([
          ["publicite", "fitStrong"],
          ["seconds-roles", "fitStrong"],
          ["figuration", "fitGood"],
        ] as const).map(([slug, fit]) => (
          <li key={slug} className="flex items-center justify-between gap-3 py-3">
            <span className="min-w-0 text-[14.5px] font-medium">{tc(`${slug}.name`)}</span>
            <span className="flex shrink-0 items-center gap-2 text-[12px]">
              <span className="rounded-[4px] bg-accent-soft px-2 py-0.5 font-medium text-accent">{t(fit)}</span>
              <span className="hidden text-fg-subtle sm:inline">{t("awaitingOk")}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>,
    // 4. Self-tape
    <div key="tape" className="join-card relative aspect-[4/3] overflow-hidden bg-[var(--stage-base,#0e0e0e)] p-0">
      <Image src={portraits.hero[2]} alt="" fill sizes="(min-width: 1024px) 30vw, 80vw" className="object-cover object-[50%_25%] opacity-90" />
      <span aria-hidden="true" className="absolute inset-x-[30%] top-[10%] h-[52%] rounded-[50%] border border-dashed border-white/60" />
      <span className="absolute left-4 top-4 flex items-center gap-1.5 text-[11.5px] font-medium text-white">
        <span className="size-2 rounded-full bg-[var(--green-glow)]" />
        REC
      </span>
      <span className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-[6px] bg-black/60 px-3 py-1.5 text-[12.5px] text-white backdrop-blur-md">
        <Check className="size-3.5 text-[var(--green-glow)]" />
        {ts("hint")}
      </span>
    </div>,
    // 5. Booked
    <div key="booked" className="join-card bg-surface-inverse text-fg-inverse">
      <span className="inline-flex items-center gap-1.5 rounded-[4px] bg-[var(--green-glow)] px-2.5 py-1 text-[12.5px] font-semibold text-[var(--ink-green)]">
        <Check className="size-3.5" />
        {t("bookedTitle")}
      </span>
      <p className="mt-5 font-[family-name:var(--font-marquee)] text-[34px] font-extrabold uppercase leading-[0.95]">
        {tc("publicite.name")}
      </p>
      <p className="mt-3 max-w-[34ch] text-[14.5px] leading-relaxed text-fg-inverse-muted">{t("bookedBody")}</p>
    </div>,
  ];

  return (
    <div className="join-steps">
      {/* Inputs first, so a :checked state can style anything after it. */}
      {items.map((item, i) => (
        <input
          key={item.title}
          type="radio"
          name="join-step"
          id={`join-step-${i}`}
          className="join-input sr-only"
          defaultChecked={i === 0}
          aria-label={`${i + 1}. ${item.title}`}
        />
      ))}

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
        {/* Step list: tap a step to see it. */}
        {/* data-demo: the ?demo tour highlights `> li:nth-child(n)` here. */}
        <ol data-demo="talents-steps" className="join-list grid gap-1.5">
          {items.map((item, i) => (
            <li key={item.title}>
              <label htmlFor={`join-step-${i}`} data-step={i} className="join-tab">
                <span className="join-num">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-[16.5px] font-semibold leading-tight">{item.title}</span>
                  <span className="join-tab-body mt-1 block text-[14px] leading-relaxed text-fg-muted">{item.body}</span>
                </span>
              </label>
            </li>
          ))}
        </ol>

        {/* The panel for the checked step. */}
        <div className="min-w-0">
          <div className="join-progress" aria-hidden="true">
            <span />
          </div>
          {items.map((item, i) => (
            <div key={item.title} data-step={i} className="join-panel">
              <p className="flex justify-between gap-4 text-[13px] text-fg-subtle">
                <span>{t("progress", { n: i + 1, total })}</span>
                <span>{t("illustration")}</span>
              </p>
              <div className="mt-3">{visuals[i]}</div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {i < total - 1 ? (
                  <label htmlFor={`join-step-${i + 1}`} className="join-next">
                    {t("next")}
                  </label>
                ) : (
                  <Link href="/talents/inscription" className="join-next">
                    {th("ctaPrimary")}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
