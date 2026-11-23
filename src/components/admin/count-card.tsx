import { Info } from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * Round 10: an admin count that says what it counts. The small "i" holds the
 * one-sentence definition (hover, focus, or read by a screen reader); the same
 * definitions are in docs/DECISIONS.md.
 */
export function CountCard({
  label,
  help,
  value,
  href,
  active,
}: {
  label: string;
  help: string;
  value: number;
  href: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group relative rounded-sedan border bg-surface p-4 transition-colors hover:border-accent ${active ? "border-accent" : "border-border"}`}
    >
      <p className="font-display text-2xl tabular-nums">{value}</p>
      <p className="flex items-center gap-1 text-xs font-bold">
        {label}
        <span title={help} className="inline-flex text-fg-muted">
          <Info aria-hidden="true" className="size-3.5" />
          <span className="sr-only">{help}</span>
        </span>
      </p>
      <p className="mt-1 hidden text-xs text-fg-muted group-hover:block group-focus-visible:block">{help}</p>
    </Link>
  );
}
