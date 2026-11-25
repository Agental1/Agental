import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Shared landing blocks for the v1 redesign. Both portals use them, so the
 * Talents (paper) and Casting (stage) skins stay one system: only the
 * semantic tokens change between them.
 */

type Item = { title: string; body: string };

/**
 * Hairline-framed card grid (after the Glow-up board): the grid lines run to
 * the container edges and each cell holds an inset card. The first card is
 * lifted onto the stage gradient to give the grid one point of entry.
 */
export function FramedCards({
  items,
  className,
}: {
  items: Item[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto max-w-site border-t border-border px-[clamp(16px,3vw,40px)]",
        className
      )}
    >
      <div className="grid border-l border-border sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => {
          const lifted = i === 0;
          return (
            <div key={item.title} className="border-b border-r border-border p-2.5">
              <div
                className={cn(
                  "flex h-full min-h-[260px] flex-col justify-between gap-10 rounded-sedan-lg p-[clamp(20px,2.4vw,28px)]",
                  lifted ? "stage-light text-[var(--stage-text,#f2f2ee)]" : "border border-border bg-bg/60"
                )}
              >
                <h3 className="max-w-[18ch] text-[clamp(1.35rem,2vw,1.65rem)] font-medium leading-[1.1] tracking-[-0.035em]">
                  {item.title}
                </h3>
                <p
                  className={cn(
                    "text-[14.5px] leading-relaxed",
                    lifted ? "text-white/70" : "text-fg-muted"
                  )}
                >
                  {item.body}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Numbered steps (after the Metafore board). Only for content that really is
 * a sequence: the numerals carry the order, so they are not decoration.
 */
export function NumberedSteps({
  items,
  className,
  ...props
}: { items: Item[]; className?: string } & React.ComponentProps<"ol">) {
  const cols =
    items.length >= 5 ? "lg:grid-cols-5" : items.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3";
  return (
    <ol className={cn("grid gap-2.5 sm:grid-cols-2", cols, className)} {...props}>
      {items.map((item, i) => (
        <li
          key={item.title}
          className="flex min-h-[260px] flex-col justify-between rounded-sedan-lg border border-border bg-surface p-5"
        >
          <span
            aria-hidden="true"
            className="text-[clamp(3.5rem,6vw,5rem)] font-light leading-none tracking-[-0.06em] text-fg/15"
          >
            {String(i + 1).padStart(2, "0")}.
          </span>
          <div>
            <h3 className="text-[17px] font-medium leading-tight tracking-[-0.025em]">
              <span className="sr-only">{i + 1}. </span>
              {item.title}
            </h3>
            <p className="mt-2 min-h-[3.4em] text-[14px] leading-relaxed text-fg-muted">
              {item.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Quotation marks by language: French and Spanish use guillemets, French
 *  with the narrow no-break space inside them. */
const QUOTES: Record<Locale, [string, string]> = {
  en: ["\u201C", "\u201D"],
  fr: ["\u00AB\u202F", "\u202F\u00BB"],
  es: ["\u00AB", "\u00BB"],
  zh: ["\u201C", "\u201D"],
  it: ["\u00AB", "\u00BB"],
  pt: ["\u201C", "\u201D"],
  ja: ["\u300C", "\u300D"],
  ko: ["\u201C", "\u201D"],
};

/** Testimonial cards: quiet sheets, quote first, attribution at the foot. */
export function QuoteCards({
  items,
}: {
  items: { quote: string; author: string }[];
}) {
  const [open, close] = QUOTES[useLocale() as Locale];
  return (
    <div className="grid gap-2.5 md:grid-cols-3">
      {items.map((item) => (
        <figure
          key={item.author}
          className="flex flex-col justify-between gap-10 rounded-sedan-xl border border-border bg-surface p-[clamp(22px,2.6vw,32px)]"
        >
          <blockquote className="text-[17px] leading-[1.45] tracking-[-0.015em]">
            {open}
            {item.quote}
            {close}
          </blockquote>
          <figcaption className="text-[13.5px] text-fg-muted">{item.author}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/**
 * Closing call to action on the stage gradient. The panel is always dark,
 * whatever the skin, so its colours are fixed rather than semantic.
 */
export function StageCta({
  title,
  body,
  primary,
  secondary,
}: {
  title: string;
  body: string;
  primary: { href: string; label: string };
  secondary: { href: string; label: string };
}) {
  return (
    <section className="px-[clamp(12px,2vw,24px)] pb-[clamp(48px,6vw,96px)]">
      <div className="stage-light relative isolate mx-auto max-w-site overflow-hidden rounded-sedan-2xl border border-white/[0.06] px-[clamp(24px,5vw,72px)] py-[clamp(56px,8vw,120px)] text-[var(--stage-text,#f2f2ee)]">
        <div className="stage-beam pointer-events-none absolute inset-0 -z-10" />
        <h2 className="display-lg max-w-[18ch] text-balance">{title}</h2>
        <span aria-hidden="true" className="hit-mark on-stage" />
        <div className="mt-10 grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
          <p className="max-w-[52ch] text-[17px] leading-relaxed text-white/70">{body}</p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={primary.href}
              className="stage-cta h-12 px-6 text-[15.5px]"
            >
              {primary.label}
            </Link>
            <Link
              href={secondary.href}
              className="stage-cta-ghost h-12 px-6 text-[15.5px]"
            >
              {secondary.label}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Split wordmark above a portal's hero: "Agental" and the portal name. */
export function SplitWordmark({ portal }: { portal: string }) {
  return (
    <p
      aria-hidden="true"
      className="display-xl brand-type flex items-baseline justify-between gap-6 px-[clamp(4px,1vw,16px)] pb-[clamp(10px,1.4vw,18px)] pt-[clamp(28px,4vw,48px)]"
    >
      <span>Agental</span>
      <span className="hidden text-fg/25 sm:inline">{portal}</span>
    </p>
  );
}
