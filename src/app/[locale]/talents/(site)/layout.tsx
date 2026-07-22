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
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("common");
  const tt = useTranslations("talents");

  const nav: NavItem[] = [
    { href: "/talents/comment-ca-marche", label: t("nav.how") },
    { href: "/castings", label: t("nav.castingTypes") },
    { href: "/talents/tarifs", label: t("nav.pricing") },
    { href: "/talents/faq", label: t("nav.faq") },
    { href: "/talents/qui-sommes-nous", label: t("nav.about") },
  ];

  return (
    <div
      data-portal="talents"
      className="flex min-h-screen flex-col bg-bg text-fg"
    >
      <MarketingHeader
        portal="talents"
        home="/talents"
        nav={nav}
        cta={{ href: "/talents/inscription", label: tt("nav.cta") }}
        crossLink={{ href: "/casting", label: tt("nav.crossLink") }}
      />
      <main className="flex-1">{children}</main>
      <MarketingFooter home="/talents" nav={nav} />
    </div>
  );
}
