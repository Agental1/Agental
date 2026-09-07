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
  // Was hardcoded to 2026. Statically rendered pages freeze this at build time,
  // which is fine and still beats a literal that silently goes stale.
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border bg-surface-2/40">
      <div className="mx-auto grid max-w-site gap-10 px-[clamp(16px,4vw,40px)] py-14 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="space-y-3">
          <Link
            href={home}
            aria-label="Agental"
            className="inline-flex min-h-11 items-center md:min-h-6"
          >
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
          <h4 className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
            {t("footer.sections.product")}
          </h4>
          <ul>
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex min-h-11 items-center md:min-h-6 text-sm text-fg-muted transition-colors hover:text-fg"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <h4 className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
            {t("footer.sections.legal")}
          </h4>
          {/* These three are plain text, not links: /mentions-legales, /cgu and
              /confidentialite do not exist yet. Rendering them as links would
              promise pages that 404. A declared French agency does need them —
              flagged rather than faked, since the copy is legal text. */}
          <ul className="text-sm text-fg-muted">
            <li className="flex min-h-11 items-center md:min-h-6">{t("footer.mentions")}</li>
            <li className="flex min-h-11 items-center md:min-h-6">{t("footer.rgpd")}</li>
            <li className="flex min-h-11 items-center md:min-h-6">{t("footer.cgu")}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-site px-[clamp(16px,4vw,40px)] py-4 font-mono text-[11px] text-fg-subtle">
          {t("footer.rights", { year })}
        </div>
      </div>
    </footer>
  );
}
