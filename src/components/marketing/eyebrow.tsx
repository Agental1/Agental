import { cn } from "@/lib/utils";

/**
 * Section label above a heading. Monospaced, uppercase, widely tracked — the
 * mockups set every one of these in JetBrains Mono at 11-12px with .12-.16em
 * of tracking.
 *
 * It was duplicated in three places with three slightly different class
 * strings (the talents landing, the casting landing, and PageHero). One
 * component so the tracking cannot drift between them — which it promptly did
 * anyway, twice, at 0.12em, before those sites were routed back through here.
 *
 * Not covered: the footer's column labels. They look like eyebrows but they are
 * real <h4> headings, and this renders a <span>; changing that would flatten the
 * footer's document outline to save four class names.
 *
 * Colour is --accent, never --cta: the mockups tint eyebrows cognac, which
 * measures 3.94:1 on crème and fails AA. --accent is chocolat, 7.53:1 on crème
 * and 8.06:1 on --surface.
 */
export function Eyebrow({
  className,
  as: Tag = "span",
  ...props
}: Omit<React.ComponentProps<"span">, "ref"> & {
  /**
   * Element to render. Defaults to a span, but the FAQ group labels need a real
   * heading: styling them as eyebrows turned both FAQ pages into a lone h1 with
   * no subheadings, which removes heading navigation from the longest pages on
   * the site. The look is an eyebrow; the semantics are a heading.
   */
  as?: "span" | "p" | "h2" | "h3" | "h4";
}) {
  return (
    <Tag
      className={cn(
        "font-mono text-[11px] uppercase leading-none tracking-[0.14em] text-accent",
        className
      )}
      {...props}
    />
  );
}
