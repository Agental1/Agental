import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { NavItem } from "./header";
import { LIMELIGHT } from "@/domain/limelight";

/**
 * Footer: the tagline and three link columns.
 *
 * Legal entries stay plain text: their pages and copy belong to the founders
 * (decision log D20), and a link to a page that does not exist is worse than
 * no link.
 */
export function MarketingFooter({
  nav,
}: {
  home: string;
  nav: NavItem[];
}) {
  const t = useTranslations("common");
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto grid max-w-site gap-10 px-[clamp(16px,3vw,40px)] pb-10 pt-16 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <p className="text-[clamp(20px,2vw,26px)] font-bold leading-[1.15] tracking-[-0.02em]">
            {t("footer.tagline")}
          </p>
          <p className="mt-4 text-[13px] text-fg-subtle">
            {t("footer.prefectorale")}
          </p>
        </div>

        <div>
          <h4 className="text-[13px] text-fg-subtle">
            {t("footer.sections.product")}
          </h4>
          <ul className="mt-3">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex min-h-9 items-center text-[15px] tracking-[-0.01em] text-fg transition-colors hover:text-fg-muted"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-[13px] text-fg-subtle">
            {t("footer.sections.company")}
          </h4>
          <ul className="mt-3">
            <li>
              <Link
                href="/talents"
                className="inline-flex min-h-9 items-center text-[15px] tracking-[-0.01em] text-fg hover:text-fg-muted"
              >
                Agental Talents
              </Link>
            </li>
            <li>
              <Link
                href="/casting"
                className="inline-flex min-h-9 items-center text-[15px] tracking-[-0.01em] text-fg hover:text-fg-muted"
              >
                Agental Casting
              </Link>
            </li>
            <li>
              {/* The website offer for performers, reachable from both portals. */}
              <Link
                href={`/talents/${LIMELIGHT.slug}`}
                className="inline-flex min-h-9 items-center text-[15px] tracking-[-0.01em] text-fg hover:text-fg-muted"
              >
                {LIMELIGHT.name}
              </Link>
            </li>
            <li>
              <Link
                href="/connexion"
                className="inline-flex min-h-9 items-center text-[15px] tracking-[-0.01em] text-fg hover:text-fg-muted"
              >
                {t("nav.signIn")}
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-[13px] text-fg-subtle">
            {t("footer.sections.legal")}
          </h4>
          <ul className="mt-3 text-[15px] text-fg-muted">
            <li className="flex min-h-9 items-center">{t("footer.mentions")}</li>
            <li className="flex min-h-9 items-center">{t("footer.rgpd")}</li>
            <li className="flex min-h-9 items-center">{t("footer.cgu")}</li>
          </ul>
        </div>
      </div>

      <div className="mx-auto flex max-w-site items-center justify-between px-[clamp(16px,3vw,40px)] pb-4 text-[12.5px] text-fg-subtle">
        <span>{t("footer.rights", { year })}</span>
        <a href="#main" className="inline-flex min-h-6 items-center hover:text-fg">
          {t("footer.backToTop")}
        </a>
      </div>

    </footer>
  );
}
