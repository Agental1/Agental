import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { toLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { SamplePortfolio } from "@/components/talents/sample-portfolio";
import { LIMELIGHT } from "@/domain/limelight";
import { seo } from "@/lib/seo";

const PATH = `/talents/${LIMELIGHT.slug}/exemple`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "talents.limelight.sample" });
  return seo({ locale, path: PATH, title: t("pageTitle"), description: t("bio") });
}

/**
 * "Explore a sample": the featured fictional portfolio, Maya Okafor, on the
 * Marquee template, with Overview, Credits and Reel to explore. Linked from
 * the Limelight page and from the Limelight blocks on the home and Talent
 * pages.
 */
export default async function SamplePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(toLocale(locale));
  return <SampleContent />;
}

function SampleContent() {
  const t = useTranslations("talents.limelight.sample");
  const path = `/talents/${LIMELIGHT.slug}`;
  return (
    <section className="mx-auto max-w-site px-[clamp(16px,3vw,40px)] pb-[clamp(40px,5vw,72px)] pt-[clamp(20px,3vw,40px)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={path}
          className="inline-flex min-h-11 items-center gap-1.5 font-bold text-accent underline-offset-4 hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t("back")}
        </Link>
        <Button asChild>
          <Link href={`${path}#start`}>{t("useTemplate")}</Link>
        </Button>
      </div>
      <SamplePortfolio template="marquee" headingLevel="h1" />
    </section>
  );
}
