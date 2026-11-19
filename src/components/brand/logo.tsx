import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The Agental monogram: an A whose left leg is blue with two cuts through it.
 *
 * Same shapes as `brand/agental-a-dark.svg` and `brand/agental-a-white.svg`.
 * The blue is fixed; the rest of the letter takes the current text color, so
 * the one component is near-black on the Talent theme and white on Casting.
 * It replaces the four-point star and the "T" tape mark everywhere.
 */
export const MARK_VIEWBOX = "160 200 932 857";
export const MARK_BLUE = [
  "577,210 680,210 625,355 460,435",
  "420,517 596,430 568,508 380,600",
  "340,683 530,590 330,1047 185,1047 170,1025",
];
/** The blue leg without the cuts, for sizes too small to show them. */
export const MARK_BLUE_SOLID = "577,210 680,210 330,1047 185,1047 170,1025";
export const MARK_INK = "680,210 1082,1025 1067,1047 918,1047 828,850 415,850 461,748 782,748 617,393 625,355";

export function AgentalMark({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      className={cn("inline-block", className)}
      aria-hidden="true"
      {...props}
    >
      {MARK_BLUE.map((points) => (
        <polygon key={points} fill="#246bfe" points={points} />
      ))}
      <polygon fill="currentColor" points={MARK_INK} />
    </svg>
  );
}

/**
 * The monogram with "Agental" beside it where there is room.
 *
 * `portal` is optional so pages that belong to neither audience (the entry
 * screen, sign-in, the 404) render a bare "Agental".
 */
export function AgentalLogo({
  className,
  wordmark = true,
  portal,
}: {
  className?: string;
  wordmark?: boolean;
  /** Second word of the lockup, e.g. "Talents". */
  portal?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-fg", className)}>
      <AgentalMark className="h-7 w-auto" />
      {wordmark && (
        <span className="brand-type text-[20px] font-bold leading-none tracking-[-0.03em]">
          Agental
          {portal && <span className="ml-1.5 font-normal text-fg-muted">{portal}</span>}
        </span>
      )}
    </span>
  );
}
