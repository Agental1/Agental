import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { listDraftsToApprove, listRecentDecisions, purgeOldReplyTexts } from "@/lib/reply-drafts";
import { emailSenderConfigured } from "@/lib/mailer";
import { decideReplyForm } from "@/app/actions/admin-replies";
import { Badge } from "@/components/ui/badge";
import { dateTime } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.replies")}`, robots: { index: false } };
}

/**
 * Round 9, group 7: Admin > Replies to approve. Each email that reached
 * contact@agental.co and got a draft from the workflow: the original, the
 * draft, and three buttons. Only these buttons send. Admins only; every view
 * and decision audited.
 */
export default async function RepliesPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const adminId = await currentAdminId();
  if (!adminId) notFound();
  const t = await getTranslations({ locale, namespace: "app" });
  const sp = await searchParams;
  await purgeOldReplyTexts().catch(() => {});
  const [drafts, recent] = await Promise.all([listDraftsToApprove(), listRecentDecisions()]);
  await audit({ actorUserId: adminId, action: "admin.view.replies", resourceType: "InboxReply", resourceId: "*", after: { waiting: drafts.length } });
  const r = "admin.replies" as const;
  const result = typeof sp.result === "string" ? sp.result : null;
  const ok = result === "sent" || result === "discarded";
  const known = ["sent", "discarded", "already_decided", "no_sender", "send_failed", "empty", "not_found", "forbidden"];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-medium">{t(`${r}.title`)}</h1>
        <p className="max-w-3xl text-fg-muted">{t(`${r}.subtitle`)}</p>
      </div>
      {!emailSenderConfigured() && (
        <p role="alert" className="rounded-sedan border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
          {t(`${r}.noSender`)}
        </p>
      )}
      {result && (
        <p role={ok ? "status" : "alert"} className={`rounded-sedan border px-4 py-3 text-sm ${ok ? "border-success/40 bg-success/5" : "border-danger/40 bg-danger/5"}`}>
          {t(`${r}.results.${known.includes(result) ? result : "send_failed"}`)}
        </p>
      )}

      {drafts.length === 0 ? (
        <div className="rounded-sedan border border-dashed border-border p-8 text-center">
          <p className="font-bold">{t(`${r}.empty`)}</p>
          <p className="mt-1 text-sm text-fg-muted">{t(`${r}.emptyHint`)}</p>
        </div>
      ) : (
        <ul className="space-y-6">
          {drafts.map((d) => (
            <li key={d.id} className="space-y-4 rounded-sedan border border-border bg-surface p-5">
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="font-bold">{d.subject || t(`${r}.noSubject`)}</p>
                {d.category && <Badge variant="neutral">{d.category}</Badge>}
                <p className="ml-auto text-xs text-fg-muted">{d.draftedAt ? dateTime(d.draftedAt, locale) : ""}</p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <section>
                  <h2 className="text-xs font-bold uppercase text-fg-muted">{t(`${r}.original`, { from: d.fromAddress ?? "" })}</h2>
                  <p className="mt-2 whitespace-pre-wrap rounded-sedan border border-border bg-surface-2 p-3 text-sm">{d.originalText || t(`${r}.textCleared`)}</p>
                </section>
                <section>
                  <h2 className="text-xs font-bold uppercase text-fg-muted">{t(`${r}.draft`)}</h2>
                  <p className="mt-2 whitespace-pre-wrap rounded-sedan border border-accent/40 bg-accent-soft/40 p-3 text-sm">{d.replyText}</p>
                </section>
              </div>
              <div className="flex flex-wrap items-start gap-3">
                <form action={decideReplyForm}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="action" value="send" />
                  <button className="h-10 rounded-full bg-accent px-5 text-sm font-bold text-[var(--accent-fg)]">{t(`${r}.send`)}</button>
                </form>
                <details className="min-w-[16rem] flex-1">
                  <summary className="inline-flex h-10 cursor-pointer items-center rounded-full border border-accent px-5 text-sm font-bold text-accent">{t(`${r}.edit`)}</summary>
                  <form action={decideReplyForm} className="mt-3 space-y-2">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="action" value="edit" />
                    <textarea name="text" defaultValue={d.replyText ?? ""} rows={8} maxLength={8000} className="w-full rounded-sedan border border-border bg-surface p-3 text-sm" aria-label={t(`${r}.edit`)} />
                    <button className="h-10 rounded-full bg-accent px-5 text-sm font-bold text-[var(--accent-fg)]">{t(`${r}.sendEdited`)}</button>
                  </form>
                </details>
                <form action={decideReplyForm}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="action" value="discard" />
                  <button className="h-10 rounded-full border border-danger px-5 text-sm font-bold text-danger hover:bg-danger/10">{t(`${r}.discard`)}</button>
                </form>
              </div>
              <p className="text-xs text-fg-muted">{t(`${r}.how`, { to: d.fromAddress ?? "" })}</p>
            </li>
          ))}
        </ul>
      )}

      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-lg font-medium">{t(`${r}.recent`)}</h2>
          <ul className="space-y-1 text-sm">
            {recent.map((d) => (
              <li key={d.id} className="flex flex-wrap gap-2 text-fg-muted">
                <span className="tabular-nums">{d.decidedAt ? dateTime(d.decidedAt, locale) : ""}</span>
                <span className="font-medium text-fg">{d.subject}</span>
                <Badge variant={d.status === "approved_sent" ? "success" : "neutral"}>{t(`${r}.decisions.${d.decision ?? "sent"}`)}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
