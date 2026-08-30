import { toLocale } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { MarketingHeader, type NavItem } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";

export default function CastingLayout({
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
  const tc = useTranslations("casting");

  const nav: NavItem[] = [
    { href: "/casting/comment-ca-marche", label: t("nav.how") },
    { href: "/casting/tarifs", label: t("nav.pricing") },
    { href: "/casting/faq", label: t("nav.faq") },
  ];

  return (
    <div
      data-portal="casting"
      className="flex min-h-screen flex-col bg-bg text-fg"
    >
      <MarketingHeader
        portal="casting"
        home="/casting"
        nav={nav}
        cta={{ href: "/casting/inscription", label: tc("nav.cta") }}
        crossLink={{ href: "/talents", label: tc("nav.crossLink") }}
      />
      <main id="main" className="flex-1">{children}</main>
      <MarketingFooter home="/casting" nav={nav} />
    </div>
  );
}
