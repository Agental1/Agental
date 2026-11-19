import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Agental monogram: the letter A on the accent.
 *
 * Stand-in until the three brand files (the A drawn as a door opening, the
 * wordmark and the lockup) are added under `/brand`. Every surface that needs
 * a mark renders this one component, so the real monogram replaces it in one
 * place. The four-point star and the "T" tape mark are gone.
 */
export function AgentalMark({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("inline-block", className)}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id="agental-mark-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#246bfe" />
          <stop offset="1" stopColor="#1648c4" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill="url(#agental-mark-fill)" />
      <path
        fill="#ffffff"
        d="M20.6 11h6.8l9.1 26h-6.3l-1.7-5.4h-9.2L17.6 37h-6.1L20.6 11Zm.3 15.8h6.1L24 17l-3.1 9.8Z"
      />
    </svg>
  );
}

/**
 * Wordmark, with the monogram in front of it where there is room.
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
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <AgentalMark className="size-7" />
      {wordmark && (
        <span className="brand-type text-[20px] font-bold leading-none tracking-[-0.03em] text-fg">
          Agental
          {portal && <span className="ml-1.5 font-normal text-fg-muted">{portal}</span>}
        </span>
      )}
    </span>
  );
}
