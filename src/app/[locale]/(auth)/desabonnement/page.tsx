import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { isEmailCategory, unsubscribeTokenValid } from "@/lib/email-unsubscribe";
import { unsubscribeForm } from "@/app/actions/unsubscribe";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: "app" });
  return { title: t("unsubscribe.title"), robots: { index: false }, referrer: "no-referrer" };
}

/**
 * Round 9, group 6: the page behind "Unsubscribe from these emails". Opening
 * it changes nothing (link scanners open links); the button does, for that
 * account and that category only. No sign-in needed: the link is signed.
 */
export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "app" });
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const u = one("u");
  const c = one("c");
  const tok = one("t");
  let valid = false;
  try {
    valid = unsubscribeTokenValid(u, c, tok);
  } catch {
    valid = false;
  }
  const done = one("done") === "1";

  return (
    <div className="mx-auto max-w-md space-y-4 py-10">
      <h1 className="font-display text-2xl font-medium">{t("unsubscribe.title")}</h1>
      {!valid ? (
        <p className="text-fg-muted">{t("unsubscribe.invalid")}</p>
      ) : done ? (
        <p role="status" className="text-fg-muted">
          {t("unsubscribe.done", { category: t(`unsubscribe.categories.${isEmailCategory(c) ? c : "welcome"}`) })}
        </p>
      ) : (
        <form action={unsubscribeForm} className="space-y-4">
          <p className="text-fg-muted">{t("unsubscribe.confirm", { category: t(`unsubscribe.categories.${isEmailCategory(c) ? c : "welcome"}`) })}</p>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="u" value={u} />
          <input type="hidden" name="c" value={c} />
          <input type="hidden" name="t" value={tok} />
          <button className="h-11 rounded-full bg-accent px-6 text-sm font-bold text-[var(--accent-fg)]">{t("unsubscribe.button")}</button>
        </form>
      )}
      <p className="text-sm">
        <Link href="/talents/app/parametres?tab=notifications" className="font-bold text-accent hover:underline">
          {t("unsubscribe.settings")}
        </Link>
      </p>
    </div>
  );
}
