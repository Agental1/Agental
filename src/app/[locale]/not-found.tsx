import { useTranslations } from "next-intl";
import { MarketingHeader, type NavItem } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { NotFoundContent } from "@/components/marketing/not-found-content";

/**
 * Catch-all 404: anything outside the two marketing trees lands here — a legacy
 * unprefixed URL, a mistyped path, a deleted route.
 *
 * Unlike the portal 404s, this one renders inside [locale]/layout.tsx, which is
 * only <html>/<body> plus the intl provider. It has no header, no footer and no
 * data-portal, so it has to mount its own chrome — otherwise the page arrives as
 * a bare body on the default skin with no way back.
 *
 * Talents is the brand's front door, so that is the skin and the nav we show.
 *
 * Known limitation, stated rather than hidden: an unmatched URL under
 * /<locale>/casting/** also lands here and therefore renders in the light
 * Talents skin. The catch-all that produces these 404s lives at
 * [locale]/[...rest], outside both (site) route groups, so notFound() from it
 * can only resolve to this file. Portal-specific 404s only work where a page
 * inside that tree actually calls notFound() — which is why the Casting
 * workspace has its own at casting/(space)/not-found.tsx, and why the two
 * (site) variants were removed: nothing could ever reach them.
 */
export default function LocaleNotFound() {
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
      <main id="main" className="flex-1">
        <NotFoundContent portal="talents" />
      </main>
      <MarketingFooter home="/talents" nav={nav} />
    </div>
  );
}
