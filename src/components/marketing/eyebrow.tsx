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
 * v1 redesign: a small outlined pill with a spike-tape dot, after the
 * "Appearance matters" chip on the reference boards. Sentence case, not
 * tracked caps — the label reads, it does not shout.
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
        "inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1.5 font-mono text-[11.5px] leading-none tracking-[-0.01em] text-fg-muted before:size-1.5 before:shrink-0 before:rounded-full before:bg-signal before:content-['']",
        className
      )}
      {...props}
    />
  );
}
