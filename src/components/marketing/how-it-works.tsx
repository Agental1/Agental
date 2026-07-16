import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { PageHero } from "./page-hero";

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

  return (
    <>
      <PageHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        subtitle={t("hero.subtitle")}
      />
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <ol className="space-y-10">
          {sections.map((s, i) => (
            <li key={s.title} className="flex gap-5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-accent font-display text-lg text-accent">
                {i + 1}
              </span>
              <div className="pt-1.5">
                <h2 className="font-display text-xl font-medium">{s.title}</h2>
                <p className="mt-2 text-fg-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-12 text-center">
          <Button asChild size="lg">
            <Link href={ctaHref}>
              {t("cta")} <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
