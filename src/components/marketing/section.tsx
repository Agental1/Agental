import { cn } from "@/lib/utils";

/**
 * Page section: container width, vertical rhythm, and optional ground.
 *
 * Replaces ~30 repetitions of `mx-auto max-w-6xl px-4 py-20 sm:px-6`. The
 * measurements come from the mockups: a 1200px container (max-w-6xl was 1152,
 * an approximation) and a three-step vertical scale.
 */
const WIDTHS = {
  /** 1200px — landings, the default. */
  site: "max-w-site",
  /** ~900px — final CTA, centred argument blocks. */
  narrow: "max-w-[56rem]",
  /** ~820px — long-form reading: FAQ, about, SEO landings. */
  prose: "max-w-[51rem]",
} as const;

const RHYTHM = {
  /** Major section break. */
  major: "py-[clamp(52px,7vw,96px)]",
  /** Banded section, slightly tighter. */
  band: "py-[clamp(44px,6vw,80px)]",
  /** Compact: reassurance strips, sub-blocks. */
  compact: "py-[clamp(40px,5vw,72px)]",
  /** No vertical padding — caller owns it. */
  none: "",
} as const;

const TONES = {
  plain: "",
  band: "bg-surface-2/50 border-y border-border",
} as const;

export function Section({
  width = "site",
  rhythm = "major",
  tone = "plain",
  className,
  innerClassName,
  children,
  ...props
}: React.ComponentProps<"section"> & {
  width?: keyof typeof WIDTHS;
  rhythm?: keyof typeof RHYTHM;
  tone?: keyof typeof TONES;
  innerClassName?: string;
}) {
  return (
    <section className={cn(TONES[tone], className)} {...props}>
      <div
        className={cn(
          "mx-auto px-[clamp(16px,4vw,40px)]",
          WIDTHS[width],
          RHYTHM[rhythm],
          innerClassName
        )}
      >
        {children}
      </div>
    </section>
  );
}
