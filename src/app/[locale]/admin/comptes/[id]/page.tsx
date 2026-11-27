import { completenessOf } from "@/lib/completeness";
import { consentChoiceOf } from "@/domain/consent-choice";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { accountTimeline } from "@/lib/admin/accounts";
import { adminDateTime } from "@/lib/format";
import { accountType, isTestAccount } from "@/domain/account-model";
import { setAccountStatusForm } from "@/app/actions/admin-accounts";

/** One account's timeline. Media open through the private media route (signed link). */
export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: raw, id } = await params;
  const sp = await searchParams;
  const locale = toLocale(raw);
  setRequestLocale(locale);
  const adminId = await currentAdminId();
  if (!adminId) notFound();
  const data = await accountTimeline(id);
  if (!data) notFound();
  const t = await getTranslations({ locale, namespace: "app" });
  await audit({
    actorUserId: adminId,
    action: "admin.view.account",
    resourceType: "User",
    resourceId: id,
  });
  const { user, events } = data;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/comptes"
        className="text-sm font-bold text-accent hover:underline"
      >
        {t("admin.accounts.back")}
      </Link>
      <div>
        <h1 className="font-display text-3xl font-medium">
          {user.artistProfile?.stageName || user.name || user.email}
        </h1>
        <p className="text-fg-muted">
          {user.email} · {t(`admin.accounts.types.${accountType(user)}`)}
          {isTestAccount(user) ? ` · ${t("admin.accounts.testBadge")}` : ""}
          {user.artistProfile
            ? ` · ${completenessOf(user.artistProfile)}%`
            : ""}
        </p>
        {/* Round 11: the cookie choice and the Privacy Policy accepted, with dates (Los Angeles) and versions. */}
        <p className="mt-1 text-sm">
          <span className="font-bold">{t("admin.accounts.cols.cookies")}:</span>{" "}
          {t(`admin.cookies.choices.${consentChoiceOf(user)}`)}
          {user.consentAt ? ` · ${adminDateTime(user.consentAt, locale)}` : ""}
          {user.consentVersion ? ` · ${user.consentVersion}` : ""}
        </p>
        {/* Round 12.1: three acceptances, never merged: each with its own date and version. */}
        <dl className="mt-2 grid max-w-xl gap-1 text-sm sm:grid-cols-[14rem_1fr]">
          <dt className="font-bold">{t("admin.accounts.acceptances.privacy")}</dt>
          <dd>
            {user.privacyAcceptedAt
              ? t("admin.cookies.privacyAccepted", { date: adminDateTime(user.privacyAcceptedAt, locale), version: user.privacyVersion ?? "-" })
              : t("admin.accounts.acceptances.notRecorded")}
          </dd>
          <dt className="font-bold">{t("admin.accounts.acceptances.representation")}</dt>
          <dd>
            {user.representationAckAt
              ? t("admin.cookies.privacyAccepted", { date: adminDateTime(user.representationAckAt, locale), version: user.representationAckVersion ?? "-" })
              : t("admin.accounts.acceptances.notRecorded")}
          </dd>
          <dt className="font-bold">{t("admin.accounts.acceptances.plans")}</dt>
          <dd>
            {user.plansStepAt
              ? t("admin.accounts.acceptances.plansPicked", { date: adminDateTime(user.plansStepAt, locale), version: user.plansStepVersion ?? "-", plan: user.plansStepChoice ?? "-" })
              : t("admin.accounts.acceptances.notRecorded")}
          </dd>
        </dl>
      </div>
      {user.deletedAt ? (
        <p
          role="status"
          className="rounded-sedan border border-danger/40 bg-danger/5 px-4 py-3 text-sm"
        >
          {t("admin.deleted.detailBanner")}{" "}
          <Link
            href="/admin/suppression"
            className="font-bold text-accent hover:underline"
          >
            {t("admin.nav.cleanup")}
          </Link>
        </p>
      ) : (
        <form
          action={setAccountStatusForm}
          className="flex flex-wrap items-end gap-2 rounded-sedan border border-border bg-surface p-4"
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="id" value={user.id} />
          <input
            type="hidden"
            name="back"
            value={`/admin/comptes/${user.id}`}
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-bold">{t("admin.accounts.statusOne")}</span>
            <select
              name="status"
              defaultValue=""
              aria-label={t("admin.accounts.statusOne")}
              className="h-10 rounded-sedan border border-border bg-surface px-2 text-sm"
            >
              <option value="" disabled>
                {t("admin.accounts.marks.choose")}
              </option>
              {(["TEST", "UNREVIEWED", "staff:on", "staff:off", "REVOKED", "SPAM"] as const).map((m) => (
                <option key={m} value={m}>
                  {t(`admin.accounts.marks.${m.replace(":", "_")}`)}
                </option>
              ))}
            </select>
          </label>
          <button className="h-10 rounded-sedan border border-accent px-4 text-sm font-bold text-accent hover:bg-accent/10">
            {t("admin.accounts.apply")}
          </button>
          {typeof sp.updated === "string" && (
            <p role="status" className="text-sm text-fg-muted">
              {t("admin.accounts.updated", { count: Number(sp.updated) || 0 })}
            </p>
          )}
          {user.isAdmin && (
            <span className="text-xs text-fg-muted">
              {t("admin.accounts.admin")}
            </span>
          )}
        </form>
      )}
      <h2 className="font-display text-xl font-medium">
        {t("admin.accounts.timeline")}
      </h2>
      <ol className="space-y-2">
        {events.map((e, i) => (
          <li
            key={i}
            className="flex flex-wrap items-baseline gap-3 rounded-sedan border border-border bg-surface p-3 text-sm"
          >
            <span className="w-40 shrink-0 text-fg-muted">
              {adminDateTime(e.at, locale)}
            </span>
            <span className="font-bold">
              {t(`admin.accounts.events.${e.kind}`)}
            </span>
            {e.detail && <span className="text-fg-muted">{e.detail}</span>}
            {e.mediaId && (
              <a
                href={`/api/media/${e.mediaId}`}
                target="_blank"
                rel="noreferrer"
                className="font-bold text-accent hover:underline"
              >
                {t("admin.accounts.open")}
              </a>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
