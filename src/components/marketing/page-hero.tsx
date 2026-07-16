import { cn } from "@/lib/utils";

/** Simple marketing page header: eyebrow + title + optional subtitle. */
export function PageHero({
  eyebrow,
  title,
  subtitle,
  className,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className={cn("border-b border-border", className)}>
      <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 md:py-20">
        {eyebrow && (
          <span className="text-xs font-semibold uppercase tracking-[0.15em] text-accent">
            {eyebrow}
          </span>
        )}
        <h1 className="mt-3 font-display text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mx-auto mt-4 max-w-2xl text-lg text-fg-muted">
            {subtitle}
          </p>
        )}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </section>
  );
}
