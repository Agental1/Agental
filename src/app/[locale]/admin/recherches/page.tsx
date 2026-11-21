import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { dateTime } from "@/lib/format";
import { currentAdminId } from "@/lib/limelight/admin";
import { listAllRoleSearches } from "@/lib/role-search";
import { jobCounts, listApplications, listWorkflowRuns, runState, searchState, type JobState } from "@/lib/admin/jobs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.roleSearches")}`, robots: { index: false } };
}

const STATE_VARIANT: Record<JobState, "accent" | "warning" | "success" | "danger" | "neutral"> = {
  queued: "accent",
  running: "warning",
  completed: "success",
  failed: "danger",
  canceled: "neutral",
};

function State({ state, raw, label }: { state: JobState; raw: string; label: string }) {
  return (
    <span className="whitespace-nowrap">
      <Badge variant={STATE_VARIANT[state]}>{label}</Badge>
      <span className="ml-1 font-mono text-[10px] text-fg-subtle">{raw}</span>
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-sedan border border-dashed border-border p-6 text-sm text-fg-muted">{text}</p>;
}

/**
 * Applications and AI jobs, with the statuses as recorded: AI role searches
 * (the queue n8n claims), workflow runs, application drafts and casting-side
 * candidatures. Admins only (performers see their own rows).
 */
export default async function JobsAdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  if (!(await currentAdminId())) notFound();
  const t = await getTranslations({ locale, namespace: "app" });
  const tt = await getTranslations({ locale, namespace: "talents" });
  const planNames = (tt.raw("pricing.plans") as { name: string }[]).map((p) => p.name);
  const PLAN_INDEX: Record<string, number> = { FREE: 0, PRO: 1, PREMIUM: 2, ULTIMATE: 3 };
  const [searches, runs, apps, counts] = await Promise.all([
    listAllRoleSearches(),
    listWorkflowRuns(),
    listApplications(),
    jobCounts(),
  ]);
  const when = (d: Date | null) => (d ? dateTime(d, locale) : "-");
  const stateLabel = (s: JobState) => t(`admin.roleSearches.states.${s}`);
  const th = "p-3 font-medium";

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("admin.roleSearches.title")}</h1>
        <p className="text-fg-muted">{t("admin.roleSearches.subtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        {(["queued", "running", "completed", "failed", "canceled"] as const).map((s) => (
          <div key={s} className="rounded-sedan border border-border bg-surface p-4">
            <p className="font-display text-2xl tabular-nums">{counts[s]}</p>
            <p className="text-xs font-bold">{t(`admin.roleSearches.states.${s}`)}</p>
          </div>
        ))}
      </div>

      <section aria-labelledby="searches" className="space-y-3">
        <h2 id="searches" className="font-display text-xl font-medium">
          {t("admin.roleSearches.searches")}
        </h2>
        {searches.length === 0 ? (
          <Empty text={t("admin.roleSearches.empty")} />
        ) : (
          <div className="overflow-x-auto rounded-sedan border border-border bg-surface">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-fg-muted">
                <tr>
                  <th className={th}>{t("admin.roleSearches.columns.when")}</th>
                  <th className={th}>{t("admin.roleSearches.columns.who")}</th>
                  <th className={th}>{t("admin.roleSearches.columns.plan")}</th>
                  <th className={th}>{t("admin.roleSearches.columns.status")}</th>
                  <th className={th}>{t("admin.roleSearches.columns.started")}</th>
                  <th className={th}>{t("admin.roleSearches.columns.completed")}</th>
                  <th className={th}>{t("admin.roleSearches.columns.error")}</th>
                </tr>
              </thead>
              <tbody>
                {searches.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap p-3">{when(r.createdAt)}</td>
                    <td className="p-3">
                      <Link href={`/admin/comptes/${r.user.id}`} className="text-accent hover:underline">
                        {r.user.email}
                      </Link>
                    </td>
                    <td className="p-3">
                      {planNames[PLAN_INDEX[r.plan] ?? -1] ?? r.plan}
                      <span className="block font-mono text-[10px] text-fg-subtle">
                        {r.periodKey} #{r.seq}
                      </span>
                    </td>
                    <td className="p-3">
                      <State state={searchState(r.status)} raw={r.status} label={stateLabel(searchState(r.status))} />
                    </td>
                    <td className="whitespace-nowrap p-3">{when(r.startedAt)}</td>
                    <td className="whitespace-nowrap p-3">{when(r.completedAt)}</td>
                    <td className="max-w-[20rem] break-words p-3 text-fg-muted">{r.error ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="runs" className="space-y-3">
        <h2 id="runs" className="font-display text-xl font-medium">
          {t("admin.roleSearches.runs")}
        </h2>
        {runs.length === 0 ? (
          <Empty text={t("admin.roleSearches.emptyRuns")} />
        ) : (
          <div className="overflow-x-auto rounded-sedan border border-border bg-surface">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-fg-muted">
                <tr>
                  <th className={th}>{t("admin.roleSearches.columns.when")}</th>
                  <th className={th}>{t("admin.roleSearches.columns.kind")}</th>
                  <th className={th}>{t("admin.roleSearches.columns.status")}</th>
                  <th className={th}>{t("admin.roleSearches.columns.attempts")}</th>
                  <th className={th}>{t("admin.roleSearches.columns.started")}</th>
                  <th className={th}>{t("admin.roleSearches.columns.completed")}</th>
                  <th className={th}>{t("admin.roleSearches.columns.error")}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap p-3">{when(r.createdAt)}</td>
                    <td className="p-3 font-mono text-xs">
                      {r.kind}
                      {r.subjectRef && <span className="block text-fg-subtle">{r.subjectRef}</span>}
                    </td>
                    <td className="p-3">
                      <State state={runState(r.status)} raw={r.status} label={stateLabel(runState(r.status))} />
                    </td>
                    <td className="p-3 tabular-nums">
                      {r.attempts}/{r.maxAttempts}
                    </td>
                    <td className="whitespace-nowrap p-3">{when(r.startedAt)}</td>
                    <td className="whitespace-nowrap p-3">{when(r.finishedAt)}</td>
                    <td className="max-w-[20rem] break-words p-3 text-fg-muted">{r.lastError ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="apps" className="space-y-3">
        <h2 id="apps" className="font-display text-xl font-medium">
          {t("admin.roleSearches.applications")}
        </h2>
        <p className="text-sm text-fg-muted">{t("admin.roleSearches.applicationsHelp")}</p>
        {apps.drafts.length === 0 && apps.candidatures.length === 0 ? (
          <Empty text={t("admin.roleSearches.emptyApplications")} />
        ) : (
          <div className="overflow-x-auto rounded-sedan border border-border bg-surface">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="text-left text-fg-muted">
                <tr>
                  <th className={th}>{t("admin.roleSearches.columns.when")}</th>
                  <th className={th}>{t("admin.roleSearches.columns.who")}</th>
                  <th className={th}>{t("admin.roleSearches.columns.role")}</th>
                  <th className={th}>{t("admin.roleSearches.columns.type")}</th>
                  <th className={th}>{t("admin.roleSearches.columns.status")}</th>
                  <th className={th}>{t("admin.roleSearches.columns.reviewed")}</th>
                </tr>
              </thead>
              <tbody>
                {apps.drafts.map((d) => (
                  <tr key={d.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap p-3">{when(d.createdAt)}</td>
                    <td className="p-3">
                      <Link href={`/admin/comptes/${d.profile.user.id}`} className="text-accent hover:underline">
                        {d.profile.stageName || d.profile.user.email}
                      </Link>
                    </td>
                    <td className="p-3">
                      {d.brief.title}
                      {d.brief.roleName && <span className="block text-fg-muted">{d.brief.roleName}</span>}
                    </td>
                    <td className="p-3">{t("admin.roleSearches.draft")}</td>
                    <td className="p-3 font-mono text-xs">{d.status}</td>
                    <td className="whitespace-nowrap p-3">{when(d.reviewedAt)}</td>
                  </tr>
                ))}
                {apps.candidatures.map((c) => (
                  <tr key={c.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap p-3">{when(c.appliedAt)}</td>
                    <td className="p-3">
                      {c.artistProfile ? (
                        <Link href={`/admin/comptes/${c.artistProfile.user.id}`} className="text-accent hover:underline">
                          {c.artistProfile.stageName || c.artistProfile.user.email}
                        </Link>
                      ) : (
                        c.source
                      )}
                    </td>
                    <td className="p-3">{c.project.title}</td>
                    <td className="p-3">{t("admin.roleSearches.candidature")}</td>
                    <td className="p-3 font-mono text-xs">{c.status}</td>
                    <td className="p-3">-</td>
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
