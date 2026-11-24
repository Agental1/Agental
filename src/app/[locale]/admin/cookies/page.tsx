import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { cookieFiltersFrom, cookieTotals, listCookieChoices, visitorTallies } from "@/lib/admin/cookies";
import { CONSENT_CHOICES } from "@/domain/consent-choice";
import { CONSENT_POLICY_VERSION } from "@/domain/consent";
import { PRIVACY_POLICY_VERSION } from "@/domain/legal-versions";
import { Badge } from "@/components/ui/badge";
import { adminDateTime } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.cookies")}`, robots: { index: false } };
}

/**
 * Round 10, group 4: who accepted the cookies. Signed-in accounts one by one
 * (choice, date, policy version), visitors without an account as weekly
 * totals only. Filters and CSV. Admins only; each view is logged.
 */
export default async function CookiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const adminId = await currentAdminId();
  if (!adminId) notFound();
  const t = await getTranslations({ locale, namespace: "app" });
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const f = cookieFiltersFrom(one);
  const [rows, weeks] = await Promise.all([listCookieChoices(f), visitorTallies()]);
  const totals = cookieTotals(rows);
  // Round 11: how many of these accounts accepted the Privacy Policy (current version or older).
  const privacyAccepted = rows.filter((r) => r.privacyAt).length;
  const privacyCurrent = rows.filter((r) => r.privacyVersion === PRIVACY_POLICY_VERSION).length;
  await audit({ actorUserId: adminId, action: "admin.view.cookies", resourceType: "User", resourceId: "*", after: { count: rows.length } });
  const c = "admin.cookies" as const;
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  const input = "h-10 rounded-sedan border border-border bg-surface px-2 text-sm";
  const shown = rows.slice(0, 500);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-medium">{t(`${c}.title`)}</h1>
        <p className="max-w-3xl text-fg-muted">{t(`${c}.subtitle`, { version: CONSENT_POLICY_VERSION })}</p>
      </div>

      <section aria-labelledby="accounts-choices" className="space-y-3">
        <h2 id="accounts-choices" className="font-display text-xl font-medium">
          {t(`${c}.accountsTitle`)}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CONSENT_CHOICES.map((k) => (
            <Link
              key={k}
              href={`/admin/cookies?choice=${k}`}
              className={`rounded-sedan border bg-surface p-4 hover:border-accent ${f.choice === k ? "border-accent" : "border-border"}`}
            >
              <p className="font-display text-2xl tabular-nums">{totals[k]}</p>
              <p className="text-xs font-bold">{t(`${c}.choices.${k}`)}</p>
            </Link>
          ))}
        </div>
        <p className="text-sm">
          <Link href="/admin/cookies?privacy=no" className="font-bold text-accent hover:underline">
            {t(`${c}.privacySummary`, { accepted: privacyAccepted, current: privacyCurrent, total: rows.length, version: PRIVACY_POLICY_VERSION })}
          </Link>
        </p>

        <form method="get" className="flex flex-wrap items-end gap-3 rounded-sedan border border-border bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs font-bold">
            {t(`${c}.filters.choice`)}
            <select name="choice" defaultValue={f.choice ?? ""} className={input}>
              <option value="">{t(`${c}.filters.all`)}</option>
              {CONSENT_CHOICES.map((k) => (
                <option key={k} value={k}>
                  {t(`${c}.choices.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            {t(`${c}.filters.version`)}
            <input name="version" defaultValue={f.version} placeholder={CONSENT_POLICY_VERSION} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            {t(`${c}.filters.privacy`)}
            <select name="privacy" defaultValue={f.privacy ?? ""} className={input}>
              <option value="">{t(`${c}.filters.all`)}</option>
              <option value="yes">{t(`${c}.privacyYes`)}</option>
              <option value="no">{t(`${c}.privacyNo`)}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            {t(`${c}.filters.privacyVersion`)}
            <input name="privacyVersion" defaultValue={f.privacyVersion} placeholder={PRIVACY_POLICY_VERSION} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            {t(`${c}.filters.from`)}
            <input type="date" name="from" defaultValue={f.from} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            {t(`${c}.filters.to`)}
            <input type="date" name="to" defaultValue={f.to} className={input} />
          </label>
          <button className="h-10 rounded-sedan bg-accent px-4 text-sm font-bold text-[var(--accent-fg)]">{t(`${c}.filters.apply`)}</button>
          {qs && (
            <Link href="/admin/cookies" className="text-sm font-bold text-accent hover:underline">
              {t(`${c}.filters.clear`)}
            </Link>
          )}
          <a href={`/api/admin/cookies${qs ? `?${qs}` : ""}`} className="ml-auto text-sm font-bold text-accent hover:underline">
            {t(`${c}.csv`)}
          </a>
        </form>

        <div className="overflow-x-auto rounded-sedan border border-border">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-surface-2 text-left text-fg-muted">
              <tr>
                <th className="p-3 font-medium">{t(`${c}.cols.account`)}</th>
                <th className="p-3 font-medium">{t(`${c}.cols.choice`)}</th>
                <th className="p-3 font-medium">{t(`${c}.cols.categories`)}</th>
                <th className="p-3 font-medium">{t(`${c}.cols.date`)}</th>
                <th className="p-3 font-medium">{t(`${c}.cols.version`)}</th>
                <th className="p-3 font-medium">{t(`${c}.cols.privacy`)}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3">
                    <Link href={`/admin/comptes/${r.id}`} className="font-bold text-accent hover:underline">
                      {r.email}
                    </Link>
                    <span className="ml-1.5 text-xs text-fg-muted">{t(`admin.accounts.types.${r.type}`)}</span>
                    {r.isTest && (
                      <Badge variant="accent" className="ml-1.5">
                        {t("admin.accounts.testBadge")}
                      </Badge>
                    )}
                  </td>
                  <td className="p-3">{t(`${c}.choices.${r.choice}`)}</td>
                  <td className="p-3 text-xs">
                    {r.choice === "none"
                      ? "-"
                      : t(`${c}.categories`, {
                          analytics: r.analytics ? t(`${c}.on`) : t(`${c}.off`),
                          marketing: r.marketing ? t(`${c}.on`) : t(`${c}.off`),
                        })}
                  </td>
                  <td className="whitespace-nowrap p-3">{r.at ? adminDateTime(r.at, locale) : "-"}</td>
                  <td className="p-3">{r.version ?? <span className="text-fg-muted">{t(`${c}.noVersion`)}</span>}</td>
                  <td className="p-3 text-xs">
                    {r.privacyAt ? (
                      t(`${c}.privacyAccepted`, { date: adminDateTime(r.privacyAt, locale), version: r.privacyVersion ?? "-" })
                    ) : (
                      <span className="text-fg-muted">{t(`${c}.privacyNo`)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > shown.length && <p className="text-xs text-fg-muted">{t(`${c}.more`, { count: rows.length - shown.length })}</p>}
      </section>

      <section aria-labelledby="visitors" className="space-y-3">
        <h2 id="visitors" className="font-display text-xl font-medium">
          {t(`${c}.visitorsTitle`)}
        </h2>
        <p className="max-w-3xl text-sm text-fg-muted">{t(`${c}.visitorsLead`)}</p>
        {weeks.length === 0 ? (
          <p className="rounded-sedan border border-dashed border-border p-6 text-center text-sm text-fg-muted">{t(`${c}.visitorsEmpty`)}</p>
        ) : (
          <div className="overflow-x-auto rounded-sedan border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-surface-2 text-left text-fg-muted">
                <tr>
                  <th className="p-3 font-medium">{t(`${c}.cols.week`)}</th>
                  {(["accepted_all", "rejected", "custom"] as const).map((k) => (
                    <th key={k} className="p-3 font-medium">
                      {t(`${c}.choices.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.weekStart.toISOString()} className="border-t border-border">
                    <td className="p-3">{t(`${c}.weekOf`, { date: w.weekStart.toISOString().slice(0, 10) })}</td>
                    <td className="p-3 tabular-nums">{w.counts.accepted_all}</td>
                    <td className="p-3 tabular-nums">{w.counts.rejected}</td>
                    <td className="p-3 tabular-nums">{w.counts.custom}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
