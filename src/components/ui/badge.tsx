import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full font-medium border px-2.5 py-0.5 text-xs leading-none [&_svg]:size-3",
  {
    variants: {
      variant: {
        neutral: "bg-surface-2 text-fg-muted border-border",
        accent: "bg-accent-soft text-accent border-transparent",
        success: "bg-transparent text-success border-success/40",
        warning: "bg-transparent text-warning border-warning/40",
        danger: "bg-transparent text-danger border-danger/40",
        solid: "bg-accent text-accent-fg border-transparent",
        // The mockups set every pill in monospaced uppercase with wide
        // tracking — provenance chips, POPULAIRE, SHORT-LIST PRÊTE.
        mono: "bg-surface-2 text-fg-muted border-border font-mono text-[10px] uppercase tracking-[0.06em]",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { badgeVariants };
