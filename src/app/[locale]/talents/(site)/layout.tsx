import { toLocale } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { MarketingHeader, type NavItem } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";

export default function TalentsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = use(params);
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);

  const t = useTranslations("common");
  const tt = useTranslations("talents");

  const nav: NavItem[] = [
    { href: "/talents/comment-ca-marche", label: t("nav.how") },
    { href: "/castings", label: t("nav.castingTypes") },
    { href: "/talents/limelight", label: tt("limelight.nav") },
    { href: "/talents/tarifs", label: t("nav.pricing") },
    { href: "/talents/faq", label: t("nav.faq") },
    { href: "/talents/qui-sommes-nous", label: t("nav.about") },
  ];

  return (
    <div
      data-portal="talents"
      data-surface="site"
      className="flex min-h-screen flex-col bg-bg text-fg"
    >
      <MarketingHeader
        portal="talents"
        home="/talents"
        nav={nav}
        cta={{ href: "/talents/inscription", label: tt("nav.cta") }}
        crossLink={{ href: "/casting", label: tt("nav.crossLink") }}
      />
      <main id="main" className="flex-1">{children}</main>
      <MarketingFooter home="/talents" nav={nav} />
    </div>
  );
}
