import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex max-w-full items-center justify-center gap-2 whitespace-nowrap rounded-[var(--btn-radius)] font-medium tracking-[-0.01em] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0 [&_svg]:size-[1.1em]",
  {
    variants: {
      variant: {
        // --cta is a chalk pill on the Casting stage and a green rectangle
        // on Talents: the one colour on the page that means "act".
        primary: "bg-cta text-cta-fg hover:bg-cta-hover",
        secondary:
          "bg-surface text-fg border border-border hover:border-border-strong",
        outline:
          "border border-border-strong text-fg hover:bg-accent-soft",
        ghost: "text-fg hover:bg-surface-2",
        link: "text-accent underline-offset-4 hover:underline",
        danger: "bg-danger text-white hover:opacity-90",
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
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
