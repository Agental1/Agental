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

/** Star + wordmark lockup. */
export function AgentalLogo({
  className,
  wordmark = true,
}: {
  className?: string;
  wordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <AgentalMark className="h-6 w-auto text-accent" />
      {wordmark && (
        <span className="font-display text-xl font-medium tracking-tight text-fg">
          Agental
        </span>
      )}
    </span>
  );
}
