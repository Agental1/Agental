import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Step = { title: string; body: string };

/**
 * The steps to join, for one audience: five for performers, three for casting
 * teams. The steps and their wording are the existing ones in the message
 * files (`talents.steps`, `casting.steps`); nothing is invented here.
 *
 * Each step is a short label that opens on click to show its detail. The
 * numbers stay because this is a real sequence. One row on desktop, a compact
 * list on a phone. Native <details>, so it works without JavaScript; the
 * shared `name` makes the browser close one step when another opens.
 */
export function StepsOverview({
  portal,
  className,
}: {
  portal: "talents" | "casting";
  className?: string;
}) {
  const tt = useTranslations("talents.steps");
  const tc = useTranslations("casting.steps");
  const talents = portal === "talents";
  const title = talents ? tt("title") : tc("title");
  const more = talents ? tt("cta") : tc("cta");
  const items = (talents ? tt.raw("items") : tc.raw("items")) as Step[];

  return (
    <section
      aria-labelledby={`steps-${portal}`}
      className={cn("mx-auto w-full max-w-site px-[clamp(16px,3vw,40px)]", className)}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <h2 id={`steps-${portal}`} className="display-md">
          {title}
        </h2>
        <Link
          href={`/${portal}/comment-ca-marche`}
          className="inline-flex min-h-11 items-center font-bold text-accent underline-offset-4 hover:underline"
        >
          {more}
        </Link>
      </div>

      <ol
        className={cn(
          "mt-6 grid items-start gap-2.5 lg:gap-3",
          items.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-3"
        )}
      >
        {items.map((step, i) => (
          <li key={step.title}>
            <details name={`steps-${portal}`} className="group">
              <summary className="pressable flex min-h-14 items-center gap-3 rounded-sedan-lg border border-border bg-surface px-4 py-3 group-open:border-accent group-open:accent-wash">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[15px] font-bold tabular-nums text-accent group-open:bg-accent group-open:text-accent-fg"
                >
                  {i + 1}
                </span>
                <span className="flex-1 text-[16px] font-bold leading-snug">{step.title}</span>
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 shrink-0 text-fg-subtle transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <p className="enter px-4 pb-1 pt-3 text-[15px] leading-relaxed text-fg-muted">
                {step.body}
              </p>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
