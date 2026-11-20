import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Download, Inbox } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { LeadStatusSelect } from "@/components/admin/lead-status-select";
import { ScrollIntoView } from "@/components/admin/scroll-into-view";
import { dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { currentAdminId } from "@/lib/limelight/admin";
import { listLimelightLeads } from "@/lib/limelight/leads";
import { listStudentPriceRequests } from "@/lib/sites";
import { StudentRequests } from "@/components/admin/student-requests";
import {
  LIMELIGHT_DISCIPLINES,
  LIMELIGHT_LEAD_STATUSES,
  LIMELIGHT_NEEDS,
  LIMELIGHT_REFERENCE_PATTERN,
  LimelightLeadStatus,
} from "@/domain/limelight";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.limelight")}` };
}

type Discipline = (typeof LIMELIGHT_DISCIPLINES)[number];
type Need = (typeof LIMELIGHT_NEEDS)[number];

function oneOf<T extends string>(values: readonly T[], value: string | null): value is T {
  return value !== null && (values as readonly string[]).includes(value);
}

/**
 * The "Start your site" form stores its choice and the message together as
 * "redo: I would like..." (see needFromLegacyForm). Split it back so the
 * choice can be shown in the reader's language.
 */
function splitNeed(need: string | null): { choice: Need | null; text: string } {
  if (!need) return { choice: null, text: "" };
  const match = /^(new|redo|unsure)(?::\s*([\s\S]*))?$/.exec(need);
  if (match && oneOf(LIMELIGHT_NEEDS, match[1])) {
    return { choice: match[1], text: match[2] ?? "" };
  }
  return { choice: null, text: need };
}

/**
 * Limelight requests: every "Request my site" lead, newest first, with its
 * status. The alert email links here with ?ref=<reference>, and that row is
 * highlighted. Admins only: everyone else gets a 404.
 */
export default async function AdminLimelightPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ref?: string | string[]; status?: string | string[] }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  if (!(await currentAdminId())) notFound();

  const t = await getTranslations({ locale, namespace: "app" });
  const tc = await getTranslations({ locale, namespace: "talents" });

  const query = await searchParams;
  const ref =
    typeof query.ref === "string" && LIMELIGHT_REFERENCE_PATTERN.test(query.ref) ? query.ref : null;
  const statusParam = LimelightLeadStatus.safeParse(query.status);
  const status = statusParam.success ? statusParam.data : undefined;

  const leads = await listLimelightLeads({ status });
  const highlighted = ref ? leads.find((lead) => lead.reference === ref) : undefined;
  const csvHref = status
    ? `/api/admin/limelight/leads.csv?status=${status}`
    : "/api/admin/limelight/leads.csv";

  const filters: { key: string; label: string; status?: LimelightLeadStatus }[] = [
    { key: "all", label: t("admin.limelight.all") },
    ...LIMELIGHT_LEAD_STATUSES.map((s) => ({
      key: s,
      label: t(`admin.limelight.statuses.${s}`),
      status: s,
    })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium">{t("admin.limelight.title")}</h1>
          <p className="text-fg-muted">{t("admin.limelight.subtitle")}</p>
        </div>
        {/* An API route, outside the locale prefix: a plain link. */}
        <a href={csvHref} className={buttonVariants({ variant: "secondary", size: "sm" })}>
          <Download aria-hidden="true" /> {t("admin.limelight.export")}
        </a>
      </div>

      <nav aria-label={t("admin.limelight.filter")} className="flex flex-wrap gap-2">
        {filters.map((f) => {
          const active = f.status === status;
          return (
            <Link
              key={f.key}
              href={f.status ? { pathname: "/admin/limelight", query: { status: f.status } } : "/admin/limelight"}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full border px-3 text-sm transition-colors",
                active
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-fg-muted hover:border-accent"
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {ref && !highlighted && (
        <p role="status" className="rounded-sedan border border-border bg-surface-2/60 px-4 py-3 text-sm text-fg-muted">
          {t("admin.limelight.refMissing", { reference: ref })}
        </p>
      )}

      {leads.length === 0 ? (
        <div className="rounded-sedan border border-dashed border-border bg-surface/60 p-10 text-center">
          <Inbox aria-hidden="true" className="mx-auto size-8 text-accent" />
          <p className="mt-3 text-sm text-fg-muted">{t("admin.limelight.empty")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-sedan border border-border">
          <table className="w-full min-w-[60rem] text-sm">
            <thead className="bg-surface-2/60 text-left text-fg-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t("admin.limelight.reference")}</th>
                <th className="px-4 py-3 font-medium">{t("admin.limelight.date")}</th>
                <th className="px-4 py-3 font-medium">{t("admin.limelight.name")}</th>
                <th className="px-4 py-3 font-medium">{t("admin.limelight.email")}</th>
                <th className="px-4 py-3 font-medium">{t("admin.limelight.type")}</th>
                <th className="px-4 py-3 font-medium">{t("admin.limelight.need")}</th>
                <th className="px-4 py-3 font-medium">{t("admin.limelight.contact")}</th>
                <th className="px-4 py-3 font-medium">{t("admin.limelight.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leads.map((lead) => {
                const need = splitNeed(lead.need);
                const isHighlighted = lead.reference === ref;
                return (
                  <tr
                    key={lead.id}
                    id={`lead-${lead.reference}`}
                    aria-current={isHighlighted ? "true" : undefined}
                    className={cn(
                      "align-top",
                      isHighlighted ? "bg-accent-soft/60 outline outline-2 -outline-offset-2 outline-accent" : "bg-surface"
                    )}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{lead.reference}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-fg-muted">
                      <time dateTime={lead.firstSeenAt.toISOString()}>
                        {dateTime(lead.firstSeenAt, locale)}
                      </time>
                      {lead.submissions > 1 && (
                        <span className="block text-xs">
                          {t("admin.limelight.submissions", { count: lead.submissions })}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{lead.name}</td>
                    <td className="px-4 py-3">
                      <a href={`mailto:${lead.email}`} className="whitespace-nowrap text-accent hover:underline">
                        {lead.email}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      {oneOf<Discipline>(LIMELIGHT_DISCIPLINES, lead.performerType)
                        ? tc(`limelight.contact.disciplines.${lead.performerType}`)
                        : (lead.performerType ?? "")}
                    </td>
                    <td className="max-w-[18rem] px-4 py-3">
                      {need.choice && (
                        <span className="block font-medium">
                          {tc(`limelight.contact.needs.${need.choice}`)}
                        </span>
                      )}
                      {need.text && (
                        <span className="block whitespace-pre-wrap break-words text-fg-muted">{need.text}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={lead.contactPref === "call" ? "accent" : "neutral"}>
                        {lead.contactPref === "call"
                          ? t("admin.limelight.prefs.call")
                          : t("admin.limelight.prefs.email")}
                      </Badge>
                      {lead.phone && (
                        <a
                          href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}
                          className="mt-1 block whitespace-nowrap text-accent hover:underline"
                        >
                          {lead.phone}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <LeadStatusSelect
                        key={`${lead.id}-${lead.status}`}
                        leadId={lead.id}
                        status={lead.status}
                        label={t("admin.limelight.statusOf", { reference: lead.reference })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {highlighted && <ScrollIntoView targetId={`lead-${highlighted.reference}`} />}

      <StudentRequests
        locale={locale}
        rows={(await listStudentPriceRequests()).map((r) => ({
          id: r.id,
          email: r.email,
          name: r.name,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
        }))}
      />
    </div>
  );
}
