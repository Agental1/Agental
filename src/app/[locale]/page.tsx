import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { use } from "react";
import { toLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { AgentalLogo, AgentalMark } from "@/components/brand/logo";
import { seo } from "@/lib/seo";

/**
 * Two-door entry (v1 redesign, decision log D18 proposal).
 *
 * `/` used to redirect straight to Talents, which left casting directors one
 * small header link away from their own product. The entry is now a split:
 * paper on the left for performers, the stage on the right for casting.
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
    <main id="main" className="flex min-h-svh flex-col bg-bg p-[clamp(8px,1.2vw,16px)] text-fg">
      <h1 className="sr-only">Agental</h1>
      <div className="flex items-center justify-between px-3 py-3">
        <AgentalLogo />
        <Link
          href="/connexion"
          className="inline-flex h-10 items-center rounded-full border border-border px-4 text-[14px] hover:border-border-strong"
        >
          {t("nav.signIn")}
        </Link>
      </div>

      <div className="grid flex-1 gap-[clamp(8px,1.2vw,16px)] md:grid-cols-2">
        <Door
          portal="talents"
          href="/talents"
          word="Talents"
          label={t("entry.talents")}
          body={tt("note")}
          cta={t("entry.enterTalents")}
        />
        <Door
          portal="casting"
          href="/casting"
          word="Casting"
          label={t("entry.casting")}
          body={tc("note")}
          cta={t("entry.enterCasting")}
        />
      </div>
    </main>
  );
}

function Door({
  portal,
  href,
  word,
  label,
  body,
  cta,
}: {
  portal: "talents" | "casting";
  href: string;
  word: string;
  label: string;
  body: string;
  cta: string;
}) {
  const dark = portal === "casting";
  return (
    <Link
      href={href}
      aria-label={cta}
      className={
        dark
          ? "group stage-light relative isolate flex min-h-[46svh] flex-col justify-between overflow-hidden rounded-sedan-2xl p-[clamp(20px,3vw,40px)] text-[#f2f2ee] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a8360a]"
          : "group relative flex min-h-[46svh] flex-col justify-between overflow-hidden rounded-sedan-2xl border border-border bg-surface p-[clamp(20px,3vw,40px)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a8360a]"
      }
    >
      {dark && <div className="stage-beam pointer-events-none absolute inset-0 -z-10" />}
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-[clamp(1.25rem,2vw,1.6rem)] font-medium tracking-[-0.035em]">
            {label}
          </p>
          <p className={dark ? "mt-2 max-w-[36ch] text-[14.5px] text-white/60" : "mt-2 max-w-[36ch] text-[14.5px] text-fg-muted"}>
            {body}
          </p>
        </div>
        <span
          className={
            dark
              ? "inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-[#f2f2ee] text-[#0e0e0e] transition-transform group-hover:-rotate-45"
              : "inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-cta text-cta-fg transition-transform group-hover:-rotate-45"
          }
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
      <div className="flex items-end justify-between gap-4">
        <span className="text-[clamp(4rem,11vw,11rem)] font-semibold leading-[0.8] tracking-[-0.065em]">
          {word}
        </span>
        <AgentalMark className="mb-2 h-[clamp(24px,3vw,40px)] w-auto text-signal" />
      </div>
    </Link>
  );
}
