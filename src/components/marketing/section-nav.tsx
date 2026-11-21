import { cn } from "@/lib/utils";

/**
 * The in-page menu on long audience pages: a sticky row of links that jump to
 * the page's sections. Plain anchors, so it works without JavaScript and with
 * the keyboard; each section sets `scroll-mt` so its heading clears the bars.
 */
export function SectionNav({
  label,
  items,
  className,
}: {
  label: string;
  items: { href: string; label: string }[];
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "sticky top-[76px] z-30 px-[clamp(12px,2vw,24px)]",
        className
      )}
    >
      <ul className="mx-auto flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-surface/90 p-1 shadow-[0_12px_32px_-22px_rgb(11_15_26/0.5)] backdrop-blur-xl [scrollbar-width:none]">
        {items.map((item) => (
          <li key={item.href} className="shrink-0">
            <a
              href={item.href}
              className="pressable inline-flex h-10 items-center whitespace-nowrap rounded-full px-4 text-[14px] font-bold text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
