import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AgentalLogo } from "@/components/brand/logo";
import type { NavItem } from "./header";

export function MarketingFooter({
  home,
  nav,
}: {
  home: string;
  nav: NavItem[];
}) {
  const t = useTranslations("common");
  const year = 2026;

  return (
    <footer className="mt-auto border-t border-border bg-surface-2/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="space-y-3">
          <Link href={home} aria-label="Agental">
            <AgentalLogo />
          </Link>
          <p className="max-w-xs text-sm text-fg-muted">
            {t("footer.tagline")}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
            <ShieldCheck className="size-3.5" />
            {t("footer.prefectorale")}
          </p>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            {t("footer.sections.product")}
          </h4>
          <ul className="space-y-1.5">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-sm text-fg-muted transition-colors hover:text-fg"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            {t("footer.sections.legal")}
          </h4>
          <ul className="space-y-1.5 text-sm text-fg-muted">
            <li>{t("footer.mentions")}</li>
            <li>{t("footer.rgpd")}</li>
            <li>{t("footer.cgu")}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-fg-subtle sm:px-6">
          {t("footer.rights", { year })}
        </div>
      </div>
    </footer>
  );
}
