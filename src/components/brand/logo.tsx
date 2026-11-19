import * as React from "react";
import { cn } from "@/lib/utils";

/** Agental four-point star — inherits currentColor (spike tape by default). */
export function AgentalMark({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 100 140"
      className={cn("inline-block", className)}
      aria-hidden="true"
      {...props}
    >
      <path
        d="M50 4 Q56 58 90 70 Q56 82 50 136 Q44 82 10 70 Q44 58 50 4 Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Talents mark (2026-11): the T of spike tape an actor hits on set. Replaces
 * the four-point star on the Talents side, which reads as the generic AI
 * "sparkle". Casting keeps the star. Inherits currentColor.
 */
export function TapeMark({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 32 28"
      className={cn("inline-block", className)}
      aria-hidden="true"
      {...props}
    >
      <rect x="0" y="0" width="32" height="8" rx="1" fill="currentColor" />
      <rect x="12" y="6" width="8" height="22" rx="1" fill="currentColor" />
    </svg>
  );
}

/**
 * Star + wordmark lockup.
 *
 * v1 redesign: the wordmark is set like the display type — Geist, tight,
 * sentence case — with the portal name trailing at lighter weight: `Agental Talents`.
 * `portal` is optional so the 404 page and the auth screens, which belong to
 * no portal, still render a bare `AGENTAL`.
 */
export function AgentalLogo({
  className,
  wordmark = true,
  portal,
  mark = portal === "Talents" ? "tape" : "star",
}: {
  className?: string;
  wordmark?: boolean;
  /** Second word of the lockup, e.g. "Talents". Rendered uppercase. */
  portal?: string;
  /** "tape" on every Talents surface, "star" everywhere else. */
  mark?: "tape" | "star";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {mark === "tape" ? (
        <TapeMark className="h-[18px] w-auto text-accent" />
      ) : (
        <AgentalMark className="h-[22px] w-auto text-signal" />
      )}
      {wordmark && (
        <span className="brand-type text-[20px] font-semibold leading-none tracking-[-0.045em] text-fg">
          Agental
          {portal && (
            <span className="brand-type ml-1.5 font-normal tracking-[-0.03em] text-fg/45">
              {portal}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
