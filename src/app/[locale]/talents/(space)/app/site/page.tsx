import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { auth } from "@/auth";
import { listMySites } from "@/lib/sites";
import { date } from "@/lib/format";
import { formatPlanPrice } from "@/lib/plan-price";
import { LIMELIGHT } from "@/domain/limelight";
import { SitePanel, type SiteCard } from "@/components/talents/site-panel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "talents" });
  return { title: t("limelight.app.title") };
}

/** "Your website": the performer's Limelight sites, in the app. */
export default async function SitePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "talents" });

  const session = await auth();
  if (!session?.user?.id) return null;
  const sites = await listMySites(session.user.id);

  const cards: SiteCard[] = sites.map((site) => ({
    id: site.id,
    template: site.template,
    name: site.content?.name ?? "",
    headline: site.content?.headline ?? "",
    status: site.publishedAt && site.status === "PUBLISHED" ? "published" : site.paidOrder ? "paid" : "draft",
    address: site.customDomain ?? (site.subdomain ? `${site.subdomain}.${LIMELIGHT.siteDomain}` : null),
    hostingUntil: site.paidOrder?.hostingRenewsAt ? date(site.paidOrder.hostingRenewsAt, locale) : null,
  }));

  const offers = (["essential", "signature"] as const).map((offer) => ({
    offer,
    name: t(`limelight.offers.${offer}.name`),
    price: formatPlanPrice(LIMELIGHT.plans[offer].priceUsd * 100, locale),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">{t("limelight.app.title")}</h1>
        <p className="text-fg-muted">{t("limelight.app.lead")}</p>
        <p className="mt-2 text-[15px] font-bold text-accent">
          {t("limelight.offers.proIncluded", { months: LIMELIGHT.includedProMonths })}
        </p>
      </div>
      <SitePanel sites={cards} offers={offers} tryHref={`/talents/${LIMELIGHT.slug}#try`} />
    </div>
  );
}
