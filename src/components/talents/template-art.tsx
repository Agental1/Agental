import { Play } from "lucide-react";
import type { LimelightTemplateId } from "@/data/limelight-templates";
import { initialsOf } from "@/data/limelight-templates";
import { cn } from "@/lib/utils";

/**
 * One Limelight template, drawn in code. Six looks, one content model: a name,
 * a headline, and initials where the headshot will go. Sizes are in container
 * query units (cqw), so the same drawing works as a small card, in the "Try
 * it" frame and full screen.
 *
 * Decorative: the caller names the template in text next to it.
 */
export function TemplateArt({
  template,
  name,
  headline,
  className,
}: {
  template: LimelightTemplateId;
  name: string;
  headline: string;
  className?: string;
}) {
  const initials = initialsOf(name) || "A";
  const base = "relative aspect-[4/3] w-full overflow-hidden [container-type:inline-size]";

  const nameEl = (c: string) => (
    <p className={cn("truncate font-bold leading-[0.95] tracking-[-0.03em]", c)}>{name}</p>
  );
  const headlineEl = (c: string) => <p className={cn("truncate", c)}>{headline}</p>;
  const photoEl = (c: string) => (
    <div
      className={cn(
        "flex items-center justify-center bg-[linear-gradient(135deg,var(--blue),var(--blue-lift))] font-bold tracking-[-0.04em] text-white",
        c
      )}
    >
      {initials}
    </div>
  );

  if (template === "marquee") {
    return (
      <div aria-hidden="true" className={cn(base, "bg-[linear-gradient(160deg,var(--night-top),var(--night-bottom))] text-white", className)}>
        <div className="grid h-full grid-cols-[0.8fr_1.2fr] gap-[4cqw] p-[5cqw]">
          {photoEl("rounded-[2.5cqw] text-[14cqw]")}
          <div className="flex min-w-0 flex-col justify-end gap-[1.5cqw]">
            {nameEl("whitespace-normal text-[8.5cqw]")}
            {headlineEl("text-[3.4cqw] text-[var(--blue-lift)]")}
            <span className="mt-[1.5cqw] inline-flex w-fit items-center gap-[1.2cqw] rounded-full bg-white px-[3cqw] py-[1.4cqw] text-[2.8cqw] font-bold text-[var(--ink)]">
              <Play className="size-[2.6cqw] fill-current" />
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (template === "contact-sheet") {
    return (
      <div aria-hidden="true" className={cn(base, "bg-white text-[var(--ink)]", className)}>
        <div className="flex h-full flex-col gap-[3cqw] p-[5cqw]">
          <div className="flex items-baseline justify-between gap-[3cqw]">
            {nameEl("text-[6cqw]")}
            {headlineEl("shrink-0 text-[3cqw] text-[var(--slate)]")}
          </div>
          <div className="grid flex-1 grid-cols-3 gap-[2cqw]">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-center justify-center rounded-[1.5cqw] text-[5cqw] font-bold text-white"
                style={{
                  background: `linear-gradient(${120 + i * 25}deg, var(--blue), ${i % 2 ? "var(--blue-night)" : "var(--blue-lift)"})`,
                }}
              >
                {i === 0 ? initials : ""}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (template === "reel-first") {
    return (
      <div aria-hidden="true" className={cn(base, "bg-[linear-gradient(135deg,var(--blue),var(--blue-night))] text-white", className)}>
        <div className="flex h-full flex-col items-center justify-center gap-[3cqw] p-[5cqw] text-center">
          <span className="flex size-[16cqw] items-center justify-center rounded-full bg-white text-[var(--blue-night)]">
            <Play className="size-[6cqw] translate-x-[0.5cqw] fill-current" />
          </span>
          {nameEl("max-w-full text-[8cqw]")}
          {headlineEl("max-w-full text-[3.4cqw] text-white/85")}
        </div>
      </div>
    );
  }

  if (template === "stage-door") {
    return (
      <div aria-hidden="true" className={cn(base, "bg-[var(--ink)] text-white", className)}>
        <div className="grid h-full grid-cols-[1.1fr_0.9fr] gap-[4cqw] p-[5cqw]">
          <div className="flex min-w-0 flex-col justify-between">
            <div>
              {nameEl("whitespace-normal text-[7.5cqw]")}
              {headlineEl("mt-[1.5cqw] text-[3.2cqw] text-[var(--mist)]")}
            </div>
            <div className="space-y-[1.8cqw]">
              {[78, 62, 70, 48].map((w) => (
                <span key={w} className="block h-[1.4cqw] rounded-full bg-white/25" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
          {photoEl("rounded-t-full text-[12cqw]")}
        </div>
      </div>
    );
  }

  if (template === "voice-booth") {
    return (
      <div aria-hidden="true" className={cn(base, "bg-[var(--day-bottom)] text-[var(--ink)]", className)}>
        <div className="flex h-full flex-col gap-[3cqw] p-[5cqw]">
          <div className="flex items-center gap-[3cqw]">
            {photoEl("size-[14cqw] shrink-0 rounded-full text-[5.5cqw]")}
            <div className="min-w-0">
              {nameEl("text-[6cqw]")}
              {headlineEl("mt-[0.8cqw] text-[3cqw] text-[var(--slate)]")}
            </div>
          </div>
          <div className="flex flex-1 flex-col justify-end gap-[2.4cqw]">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-[2.4cqw]">
                <span className="flex size-[7cqw] shrink-0 items-center justify-center rounded-full bg-[var(--blue)] text-white">
                  <Play className="size-[2.8cqw] translate-x-[0.2cqw] fill-current" />
                </span>
                <svg viewBox="0 0 120 24" className="h-[6cqw] flex-1 text-[var(--blue-deep)]" preserveAspectRatio="none">
                  {Array.from({ length: 30 }, (_, i) => {
                    const h = 4 + ((i * 7 + row * 11) % 17);
                    return <rect key={i} x={i * 4} y={12 - h / 2} width="2" height={h} rx="1" fill="currentColor" />;
                  })}
                </svg>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // studio
  return (
    <div aria-hidden="true" className={cn(base, "bg-[linear-gradient(180deg,#ffffff,var(--day-bottom))] text-[var(--ink)]", className)}>
      <div className="flex h-full flex-col p-[5cqw]">
        {photoEl("flex-1 rounded-[2.5cqw] text-[14cqw]")}
        <div className="flex items-end justify-between gap-[3cqw] pt-[3cqw]">
          <div className="min-w-0">
            {nameEl("text-[6cqw]")}
            {headlineEl("mt-[0.8cqw] text-[3cqw] text-[var(--slate)]")}
          </div>
          <span className="h-[2cqw] w-[10cqw] shrink-0 rounded-full bg-[var(--blue)]" />
        </div>
      </div>
    </div>
  );
}
