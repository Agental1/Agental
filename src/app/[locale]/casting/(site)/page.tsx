import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { seo, jsonLd, serviceLd } from "@/lib/seo";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { InteractiveDemo } from "@/components/casting/interactive-demo";
import { StepsOverview } from "@/components/marketing/steps-overview";
import { CastingPricingGrid } from "@/components/marketing/pricing-grids";

/**
 * Agental Casting landing: about three screens on a desktop, on the night
 * theme.
 *
 *   1. What it does and the one way in ("Try for free"), next to the product
 *      itself: the shortlist is what a casting team is buying, so it is the
 *      first thing they see working.
 *   2. The three steps of a casting.
 *   3. The plans, compact, with details on expand.
 *
 * The longer arguments (benefits, neutrality) live on How it works and the
 * FAQ. There are no testimonials: the page only states what is true today.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "casting" });
  return seo({
    locale,
    path: "/casting",
    title: t("meta.title"),
    description: t("meta.description"),
  });
}

export default async function CastingLanding({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "casting" });
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            serviceLd({
              locale,
              path: "/casting",
              name: t("meta.title"),
              description: t("meta.description"),
            })
          ),
        }}
      />
      <Hero />
      <StepsOverview portal="casting" />
      <Pricing />
    </>
  );
}

function Hero() {
  const t = useTranslations("casting.hero");
  return (
    <section className="mx-auto max-w-site px-[clamp(16px,3vw,40px)] pb-[clamp(40px,5vw,72px)] pt-[clamp(40px,6vw,88px)]">
      <div className="grid gap-[clamp(32px,5vw,72px)] lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <h1 className="display-xl max-w-[16ch]">
            {t("title")} {t("titleEmph")}
          </h1>
          <p className="mt-5 max-w-[56ch] text-[17px] leading-relaxed text-fg-muted">
            {t("subtitle")}
          </p>
          <div className="mt-[clamp(24px,3vw,36px)] flex flex-wrap items-center gap-x-5 gap-y-3">
            <Button asChild size="lg">
              <Link href="/casting/inscription">{t("ctaPrimary")}</Link>
            </Button>
            <p className="text-[14.5px] text-fg-muted">{t("note")}</p>
          </div>
        </div>
        {/* The product, live. */}
        <InteractiveDemo />
      </div>
    </section>
  );
}

function Pricing() {
  const t = useTranslations("casting.pricing");
  return (
    <section
      id="tarifs"
      aria-labelledby="pricing-title"
      className="mx-auto max-w-site scroll-mt-24 px-[clamp(16px,3vw,40px)] py-[clamp(48px,6vw,88px)]"
    >
      <h2 id="pricing-title" className="display-md max-w-[22ch]">
        {t("title")}
      </h2>
      <p className="mt-3 max-w-[70ch] text-fg-muted">{t("note")}</p>
      <div className="mt-6">
        <CastingPricingGrid />
      </div>
    </section>
  );
}
