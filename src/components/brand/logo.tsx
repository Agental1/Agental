import * as React from "react";
import { cn } from "@/lib/utils";

/** Agental four-point star — inherits currentColor (accent per skin). */
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
 * Star + wordmark lockup.
 *
 * The mockups set the wordmark as widely tracked uppercase, with the portal
 * name trailing it at a lighter weight and half opacity: `AGENTAL TALENTS`.
 * `portal` is optional so the 404 page and the auth screens, which belong to
 * no portal, still render a bare `AGENTAL`.
 */
export function AgentalLogo({
  className,
  wordmark = true,
  portal,
}: {
  className?: string;
  wordmark?: boolean;
  /** Second word of the lockup, e.g. "Talents". Rendered uppercase. */
  portal?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <AgentalMark className="h-[26px] w-auto text-accent" />
      {wordmark && (
        <span className="text-[19px] font-semibold uppercase leading-none tracking-[0.13em] text-fg">
          Agental
          {portal && (
            <span className="ml-2 font-medium tracking-[0.09em] text-fg/50">
              {portal}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
