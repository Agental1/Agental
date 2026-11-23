import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { approvedEmailCategories } from "@/lib/app-settings";
import { EMAIL_CATEGORIES } from "@/lib/email-unsubscribe";
import { workflowMode } from "@/domain/workflow/eligibility";
import { setEmailApprovalForm } from "@/app/actions/admin-controls";
import { Badge } from "@/components/ui/badge";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.controls")}`, robots: { index: false } };
}

/**
 * Round 9: Admin > Controls. Which automatic email categories staff approved
 * (none goes out without it), with the current mode. Group 9 adds the pause
 * switch here. Admins only; every change audited.
 */
export default async function ControlsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const adminId = await currentAdminId();
  if (!adminId) notFound();
  const t = await getTranslations({ locale, namespace: "app" });
  const sp = await searchParams;
  const approved = await approvedEmailCategories();
  await audit({ actorUserId: adminId, action: "admin.view.controls", resourceType: "AppSetting", resourceId: "*" });
  const c = "admin.controls" as const;
  const mode = workflowMode();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-medium">{t(`${c}.title`)}</h1>
        <p className="max-w-3xl text-fg-muted">{t(`${c}.subtitle`)}</p>
      </div>
      {sp.saved && (
        <p role="status" className="rounded-sedan border border-success/40 bg-success/5 px-4 py-3 text-sm">
          {t(`${c}.saved`)}
        </p>
      )}
      <section aria-labelledby="emails" className="space-y-3">
        <h2 id="emails" className="font-display text-xl font-medium">
          {t(`${c}.emails.title`)}
        </h2>
        <p className="max-w-3xl text-sm text-fg-muted">{t(`${c}.emails.lead.${mode}`)}</p>
        <ul className="space-y-2">
          {EMAIL_CATEGORIES.map((cat) => {
            const on = approved.has(cat);
            return (
              <li key={cat} className="flex flex-wrap items-center gap-3 rounded-sedan border border-border bg-surface p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{t(`${c}.emails.categories.${cat}.name`)}</p>
                  <p className="text-sm text-fg-muted">{t(`${c}.emails.categories.${cat}.body`)}</p>
                </div>
                <Badge variant={on ? "success" : "neutral"}>{on ? t(`${c}.emails.on`) : t(`${c}.emails.off`)}</Badge>
                <form action={setEmailApprovalForm}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="category" value={cat} />
                  <input type="hidden" name="approved" value={on ? "0" : "1"} />
                  <button className={`h-9 rounded-sedan px-3 text-sm font-bold ${on ? "border border-danger text-danger hover:bg-danger/10" : "bg-accent text-[var(--accent-fg)]"}`}>
                    {on ? t(`${c}.emails.stop`) : t(`${c}.emails.approve`)}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
