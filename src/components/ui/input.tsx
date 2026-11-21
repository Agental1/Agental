import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-sedan border border-field bg-surface px-3 py-2 text-fg",
        // 16px on mobile: below that, iOS Safari zooms the page on focus, which
        // is a worse mobile defect than the target size ever was.
        "text-base sm:h-10 sm:text-sm",
        "placeholder:text-fg-subtle shadow-sm transition-colors",
        "focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-danger aria-invalid:ring-danger/25",
        className
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn(
        "text-sm font-medium text-fg leading-none select-none",
        className
      )}
      {...props}
    />
  );
}
