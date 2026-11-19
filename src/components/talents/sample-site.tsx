import { useTranslations } from "next-intl";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The sample site for a fictional performer. Initials stand in for the
 * headshot. Decorative as a whole: the caption under the frames says what it is.
 */
export function SampleSite({ compact = false }: { compact?: boolean }) {
  const tf = useTranslations("talents.limelight.frame");
  const name = tf("name");
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "bg-[linear-gradient(160deg,var(--night-top),var(--night-bottom))] text-white",
        compact ? "flex flex-col gap-2.5 p-2.5 sm:gap-3 sm:p-3.5" : "grid grid-cols-[0.8fr_1.2fr] gap-[clamp(10px,2vw,28px)] p-[clamp(10px,2.4vw,32px)]"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-sedan-lg bg-[linear-gradient(135deg,var(--blue),var(--blue-lift))] font-bold tracking-[-0.04em]",
          compact ? "aspect-[5/4] text-[1.25rem] sm:text-[1.75rem]" : "aspect-[4/5] text-[clamp(1.75rem,6vw,5rem)]"
        )}
      >
        {initials}
      </div>
      <div className="flex min-w-0 flex-col justify-between gap-3">
        {!compact && (
          <p className="hidden justify-end gap-4 text-[11.5px] text-white/70 sm:flex">
            <span>{tf("resume")}</span>
            <span>{tf("contact")}</span>
          </p>
        )}
        <div>
          <p
            className={cn(
              "ll-name leading-[0.95]",
              compact ? "text-[0.875rem] sm:text-[1.05rem]" : "text-[clamp(1.05rem,2.6vw,2.25rem)]"
            )}
          >
            {name}
          </p>
          <p className={cn("mt-1.5 text-[var(--blue-lift)]", compact ? "text-[9.5px] sm:text-[10.5px]" : "text-[10.5px] sm:text-[13px]")}>
            {tf("role")}
          </p>
          {!compact && (
            <p className="mt-2 hidden max-w-[30ch] text-[12.5px] leading-snug text-white/75 sm:block">{tf("line")}</p>
          )}
        </div>
        <span
          className={cn(
            "inline-flex w-fit items-center gap-2 rounded-full bg-white font-bold text-[var(--ink)]",
            compact ? "px-2 py-1 text-[9.5px] sm:px-2.5 sm:py-1.5 sm:text-[10.5px]" : "px-2.5 py-1.5 text-[10.5px] sm:px-4 sm:py-2 sm:text-[12.5px]"
          )}
        >
          <Play className="size-[1em] fill-current" />
          {tf("reel")}
        </span>
      </div>
    </div>
  );
}
