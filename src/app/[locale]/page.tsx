import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { use } from "react";
import { toLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { AgentalLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import { StepsOverview } from "@/components/marketing/steps-overview";
import { seo } from "@/lib/seo";

/**
 * Entry screen: the first screen gets people started.
 *
 * Above the fold, on desktop and on a phone: the wordmark, Sign in, one line
 * of copy and two tiles, the two largest things on the page. "I'm a
 * performer" wears the Talent theme and "I cast roles" the Casting theme;
 * each goes straight to account creation for that audience, where the
 * "Already have an account? Sign in" link lives.
 *
 * Below the fold: the steps to join, once per audience, each in its theme.
 *
 * TODO(backend): a signed-in visitor is sent to /[locale]/continuer, which
 * picks their dashboard. The route ships with feat/auth-onboarding; the
 * redirect is added here after the rebase (handoff file, request 1).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "common" });
  return seo({
    locale,
    path: "/",
    title: t("meta.title"),
    description: t("meta.description"),
  });
}

export default function EntryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  setRequestLocale(toLocale(locale));
  const t = useTranslations("common");
  const tt = useTranslations("talents.hero");
  const tc = useTranslations("casting.hero");

  return (
    <main id="main" className="flex flex-col overflow-x-clip text-fg">
      <div className="flex h-svh min-h-[540px] flex-col px-[clamp(12px,1.6vw,24px)] pb-[clamp(12px,1.6vw,24px)]">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3">
          <AgentalLogo />
          <div className="flex items-center gap-1">
            <LocaleSwitcher compact />
            <Button asChild variant="secondary" size="sm" className="h-10 border-border-strong px-5">
              <Link href="/connexion">{t("nav.signIn")}</Link>
            </Button>
          </div>
        </header>

        <h1 className="shrink-0 pb-[clamp(10px,1.4vw,20px)] text-[clamp(1.125rem,1.2vw+0.75rem,1.5rem)] leading-tight">
          {t("entry.line")}
        </h1>

        <div className="grid min-h-0 flex-1 grid-rows-2 gap-[clamp(10px,1.2vw,16px)] md:grid-cols-2 md:grid-rows-1">
          <Tile
            portal="talents"
            href="/talents/inscription"
            label={t("entry.talents")}
            body={tt("note")}
            action={t("entry.createTalents")}
          />
          <Tile
            portal="casting"
            href="/casting/inscription"
            label={t("entry.casting")}
            body={tc("note")}
            action={t("entry.createCasting")}
          />
        </div>
      </div>

      <div data-portal="talents" className="py-[clamp(48px,6vw,88px)]">
        <StepsOverview portal="talents" />
      </div>
      <div data-portal="casting" className="py-[clamp(48px,6vw,88px)] text-fg">
        <StepsOverview portal="casting" />
      </div>
    </main>
  );
}

/**
 * One audience, one tile. The whole tile is the link; the pill inside names
 * what the click does and is part of the same link, so there is one target.
 */
function Tile({
  portal,
  href,
  label,
  body,
  action,
}: {
  portal: "talents" | "casting";
  href: string;
  label: string;
  body: string;
  action: string;
}) {
  return (
    <Link
      href={href}
      data-portal={portal}
      className="pressable group flex min-h-0 flex-col justify-between overflow-hidden rounded-sedan-2xl border border-border p-[clamp(20px,3vw,44px)] text-fg [--hover-scale:1.015] [--press-scale:1.03] hover:z-10 focus-visible:z-10"
    >
      <span className="block">
        <span className="block text-[clamp(2.25rem,5.2vw,5rem)] font-bold leading-[0.98] tracking-[-0.035em]">
          {label}
        </span>
        <span className="mt-[clamp(8px,1vw,16px)] block max-w-[34ch] text-[clamp(0.9375rem,0.4vw+0.8rem,1.125rem)] text-fg-muted">
          {body}
        </span>
      </span>
      <span className="cta-fill inline-flex h-12 w-fit max-w-full items-center rounded-full px-6 text-[15.5px] font-bold transition-[background-position] duration-200 ease-out group-hover:[background-position:100%_50%] group-focus-visible:[background-position:100%_50%]">
        <span className="truncate">{action}</span>
      </span>
    </Link>
  );
}
