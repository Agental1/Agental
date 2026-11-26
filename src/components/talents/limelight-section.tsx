import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { listMySites } from "@/lib/sites";
import { date } from "@/lib/format";
import { LIMELIGHT } from "@/domain/limelight";
import { formatPlanPrice, promoPrices } from "@/lib/plan-price";
import { BetaBadge, PaymentsNote } from "@/components/ui/beta-price";
import { PromoPrice } from "@/components/talents/promotions";
import { SitePanel, type SiteCard } from "@/components/talents/site-panel";
import type { Locale } from "@/i18n/routing";

/**
 * Limelight inside the app: the two offers, the performer's sites and the
 * request form. Lives on the Subscription page under #limelight since round 8
 * (the old Website page redirects there).
 */
export async function LimelightSection({
  userId,
  email,
  locale,
  defaultNeed,
}: {
  userId: string;
  email: string;
  locale: Locale;
  /** "redo" when the dashboard's "Improve your website" opened the page. */
  defaultNeed?: "redo";
}) {
  const t = await getTranslations({ locale, namespace: "talents" });
  const sites = await listMySites(userId);
  // Round 8b: a request with the USC promotion asks for the same verification.
  const uscVerified = !!(await prisma.user.findUnique({ where: { id: userId }, select: { uscVerifiedAt: true } }))?.uscVerifiedAt;
  const profile = await prisma.artistProfile.findUnique({
    where: { userId: userId },
    select: { stageName: true },
  });
  const to = await getTranslations({ locale, namespace: "talents.limelight.offers" });
  const offers = (["essential", "signature"] as const).map((key) => ({
    key,
    name: to(`${key}.name`),
    summary: to(`${key}.summary`),
    price: formatPlanPrice(LIMELIGHT.plans[key].priceUsd * 100, locale),
    promos: promoPrices(key === "essential" ? "LIMELIGHT_ESSENTIAL" : "LIMELIGHT_SIGNATURE", locale),
    renewal: to("renewalShort", {
      price: formatPlanPrice(LIMELIGHT.plans[key].renewalUsdPerYear * 100, locale),
    }),
  }));

  const cards: SiteCard[] = sites.map((site) => ({
    id: site.id,
    template: site.template,
    name: site.content?.name ?? "",
    headline: site.content?.headline ?? "",
    live: site.status === "PUBLISHED" && site.publishedAt !== null,
    // Served today at agental.co/s/<name>; the subdomain form needs wildcard DNS.
    address: site.customDomain ?? (site.subdomain ? `agental.co/s/${site.subdomain}` : null),
    hostingUntil: site.paidOrder?.hostingRenewsAt ? date(site.paidOrder.hostingRenewsAt, locale) : null,
    latestVersion: site.latestVersion,
    approvedVersion: site.approvedVersion,
    publishedVersion: site.publishedVersion,
    showContact: site.showContact,
  }));

  return (
    <section id="limelight" aria-labelledby="limelight-title" className="scroll-mt-24 space-y-6 border-t border-border pt-8">
      <div>
        <h2 id="limelight-title" className="text-2xl font-bold">{t("limelight.app.title")}</h2>
        <p className="text-fg-muted">{t("limelight.app.lead")}</p>
        {/* Payments are off during the beta: the team helps with publishing. */}
        <p className="mt-2 text-[15px] font-bold text-accent">{t("limelight.app.betaNote")}</p>
      </div>
      <section aria-labelledby="site-offers" className="space-y-3">
        <h3 id="site-offers" className="text-[1.125rem] font-bold">
          {to("title")}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {offers.map((o) => (
            <div key={o.key} className="rounded-sedan-xl border border-border bg-surface p-5">
              <p className="font-bold">{o.name}</p>
              <p className="mt-1 text-[1.75rem] font-bold leading-none">
                <PromoPrice base={o.price} promos={o.promos} />{" "}
                <span className="text-[14px] font-normal text-fg-muted">{to("oneTime")}</span>{" "}
                <BetaBadge />
              </p>
              <PaymentsNote className="mt-1" />
              <p className="mt-2 text-[15px] text-fg-muted">{o.summary}</p>
              <p className="mt-1 text-[14px] text-fg-muted">{o.renewal}</p>
            </div>
          ))}
        </div>
      </section>
      <SitePanel
        sites={cards}
        tryHref={`/talents/${LIMELIGHT.slug}#try`}
        contact={{ name: profile?.stageName ?? "", email: email }}
        defaultNeed={defaultNeed}
        uscVerified={uscVerified}
      />
    </section>
  );
}
