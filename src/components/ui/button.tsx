import * as React from "react";
import { Slot as SlotPrimitive } from "radix-ui";
import { Loader2 } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "pressable inline-flex max-w-full items-center justify-center gap-2 whitespace-nowrap rounded-[var(--btn-radius)] font-bold tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-60 aria-busy:cursor-progress [&_svg]:shrink-0 [&_svg]:size-[1.1em]",
  {
    variants: {
      variant: {
        // The accent as a gradient pill, the same in both themes: the one
        // fill on the page that means "act". See .cta-fill in globals.css.
        primary: "cta-fill",
        secondary:
          "bg-surface text-fg border border-border hover:border-border-strong",
        outline:
          "border border-border-strong text-fg hover:bg-accent-soft",
        ghost: "text-fg hover:bg-surface-2",
        link: "text-accent underline-offset-4 hover:underline hover:scale-100 hover:shadow-none",
        danger: "bg-danger text-white hover:opacity-90",
        // shadcn's name for the same thing.
        destructive: "bg-danger text-white hover:opacity-90",
      },
      size: {
        // Mockup metrics: 14.5px/11px 20px, 15px/13px 24px, 16px/15px 28px.
        // Heights stay >= the 24px WCAG 2.5.8 floor tools/a11y checks; lg is 48.
        sm: "h-9 px-4 text-[14px]",
        md: "h-11 px-5 text-[15px]",
        lg: "h-12 px-6 text-[15.5px]",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner, keeps the label, and blocks repeat clicks while true. */
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <SlotPrimitive.Root className={cn(buttonVariants({ variant, size }), className)} aria-disabled={disabled || undefined} {...props}>
        {children}
      </SlotPrimitive.Root>
    );
  }
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled}
      // aria-disabled rather than disabled while loading, so keyboard focus
      // stays on the button (a disabled button drops it to the page).
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      {...props}
      onClick={loading ? (e) => e.preventDefault() : props.onClick}
    >
      {loading && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
      {children}
    </button>
  );
}

export { buttonVariants };
