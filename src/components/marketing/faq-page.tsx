import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { PageHero } from "./page-hero";
import { FaqAccordion, type FaqGroup } from "./faq-accordion";

/** Shared FAQ page body, driven by a portal namespace. */
export function FaqPage({
  namespace,
  ctaHref,
}: {
  namespace: "talents.faq" | "casting.faq";
  ctaHref: string;
}) {
  const t = useTranslations(namespace);
  const groups = t.raw("groups") as FaqGroup[];

  return (
    <>
      <PageHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        subtitle={t("hero.subtitle")}
      />
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <FaqAccordion groups={groups} />
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
