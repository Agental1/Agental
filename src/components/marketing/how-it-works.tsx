import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { PageHero } from "./page-hero";
import { Section } from "./section";
import { InverseBand } from "./inverse-band";

/** Shared "how it works" page body, driven by a portal namespace. */
export function HowItWorks({
  namespace,
  ctaHref,
}: {
  namespace: "talents.how" | "casting.how";
  ctaHref: string;
}) {
  const t = useTranslations(namespace);
  const sections = t.raw("sections") as { title: string; body: string }[];
  // Not a locale-parity guard — `bun run i18n:check` already fails the build on
  // a key one locale lacks. It is a namespace guard: this component serves both
  // `talents.how` and `casting.how`, and either could legitimately ship without
  // a summary band.
  const hasSummary = t.has("summary.title");

  return (
    <>
      <PageHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        subtitle={t("hero.subtitle")}
      />
      <Section width="prose" rhythm="major">
        <ol className="space-y-4">
          {sections.map((s, i) => (
            <li
              key={s.title}
              className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 rounded-sedan-xl border border-border bg-surface p-[clamp(20px,3vw,30px)]"
            >
              <span className="font-mono text-[30px] font-bold leading-none text-accent">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h2 className="text-xl font-bold tracking-[-0.01em]">
                  {s.title}
                </h2>
                <p className="mt-2 leading-relaxed text-fg-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        {hasSummary && (
          <InverseBand className="mt-10" align="left">
            <h2 className="text-[clamp(22px,3vw,32px)] font-bold leading-[1.1] tracking-[-0.02em]">
              {t("summary.title")}
            </h2>
            <p className="mt-3 max-w-[60ch] leading-relaxed text-fg-inverse-muted">
              {t("summary.body")}
            </p>
          </InverseBand>
        )}

        <div className="mt-10">
          <Button asChild size="lg">
            <Link href={ctaHref}>
              {t("cta")} <ArrowRight />
            </Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
