import { cn } from "@/lib/utils";
import { Eyebrow } from "./eyebrow";
import { Section } from "./section";

/**
 * Marketing page header: eyebrow + title + optional subtitle.
 *
 * Left-aligned by default. The previous version hardcoded `text-center`, but
 * five of the six subpages in the mockups are left-aligned — only the final
 * CTA style centres. `align` is a prop rather than a second component because
 * every subpage and all nine SEO landings already route through this one.
 */
export function PageHero({
  eyebrow,
  title,
  subtitle,
  align = "left",
  width = "prose",
  className,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  width?: "site" | "narrow" | "prose";
  className?: string;
  children?: React.ReactNode;
}) {
  const centered = align === "center";
  return (
    <Section
      width={width}
      rhythm="compact"
      className={cn("border-b border-border", className)}
      innerClassName={cn(centered && "text-center")}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1
        className={cn(
          "display-md max-w-[18ch]",
          centered && "mx-auto",
          eyebrow && "mt-5"
        )}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          className={cn(
            "mt-4 max-w-[58ch] text-[clamp(16px,1.6vw,19px)] leading-relaxed text-fg-muted",
            centered && "mx-auto"
          )}
        >
          {subtitle}
        </p>
      )}
      {children && <div className="mt-7">{children}</div>}
    </Section>
  );
}
