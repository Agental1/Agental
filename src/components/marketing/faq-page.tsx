import { useLocale, useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { PageHero } from "./page-hero";
import { Section } from "./section";
import { FaqAccordion, type FaqGroup } from "./faq-accordion";
import { faqPageLd, jsonLd, type FaqItem } from "@/lib/seo";
import { fillFaqGroups } from "@/lib/plan-price";

/** Shared FAQ page body, driven by a portal namespace. */
export function FaqPage({
  namespace,
  ctaHref,
}: {
  namespace: "talents.faq" | "casting.faq";
  ctaHref: string;
}) {
  const t = useTranslations(namespace);
  const locale = useLocale();
  const raw = t.raw("groups") as FaqGroup[];
  // Plan figures are Talent figures: the Casting FAQ is shown as written.
  const groups = namespace === "talents.faq" ? fillFaqGroups(raw, locale) : raw;
  // Same source as the rendered accordion: structured data that drifts from the
  // visible page is a reason for Google to distrust the rest of the markup.
  const items: FaqItem[] = groups.flatMap((g) => g.items as FaqItem[]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(faqPageLd(items)) }}
      />
      <PageHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        subtitle={t("hero.subtitle")}
      />
      <Section width="prose" rhythm="major">
        <FaqAccordion groups={groups} />
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
