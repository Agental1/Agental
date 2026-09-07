import { cn } from "@/lib/utils";

/**
 * The dark (or, on the casting skin, light) block the mockups use five times:
 * the talents landing's response-rate claim, "En résumé" at the end of both
 * how-it-works pages, "Notre mission" on the about page, and the chapô on each
 * SEO landing.
 *
 * It exists as a component because those five were previously going to be
 * written five times. It also fixes a real defect: the old dark bands were
 * written with raw-palette classes (`bg-espresso text-creme`) that render
 * NOTHING — globals.css exposes semantic roles only, so there is no
 * `--color-espresso` and the talents final CTA was a transparent box.
 */
export function InverseBand({
  className,
  align = "center",
  ...props
}: React.ComponentProps<"div"> & { align?: "left" | "center" }) {
  return (
    <div
      className={cn(
        "rounded-sedan-2xl bg-surface-inverse px-[clamp(24px,4vw,56px)] py-[clamp(32px,4.5vw,64px)] text-fg-inverse",
        align === "center" && "text-center",
        className
      )}
      {...props}
    />
  );
}
