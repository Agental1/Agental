import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { approvedEmailCategories, emailGateState, pauseState, searchAccess } from "@/lib/app-settings";
import { emailCodeAvailable } from "@/lib/email-code";
import { aiAccountStates } from "@/lib/ai-spend";
import { PROVIDER_LABEL } from "@/domain/ai-spend";
import { searchCostCeilingUsd } from "@/lib/n8n/casting";
import { allowanceFor, searchPaceFor } from "@/domain/role-search";
import { PlanB2C } from "@/domain/enums";
import { EMAIL_CATEGORIES } from "@/lib/email-unsubscribe";
import { workflowMode } from "@/domain/workflow/eligibility";
import { smsConfig } from "@/lib/sms";
import { setEmailApprovalForm, setEmailGateForm, setPauseForm, setSearchAccessForm } from "@/app/actions/admin-controls";
import { dateTime } from "@/lib/format";
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
  const [approved, pause, access, ai, gate] = await Promise.all([approvedEmailCategories(), pauseState(), searchAccess(), aiAccountStates(), emailGateState()]);
  const canSendCodes = emailCodeAvailable();
  const usd = (cents: number | null) =>
    cents === null ? null : new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(cents / 100);
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
      <section aria-labelledby="pause" className={`space-y-3 rounded-sedan border p-5 ${pause.paused ? "border-danger bg-danger/5" : "border-border bg-surface"}`}>
        <h2 id="pause" className="font-display text-xl font-medium">
          {t(`${c}.pause.title`)}
        </h2>
        <p className="max-w-3xl text-sm text-fg-muted">{t(`${c}.pause.lead`)}</p>
        <p className="text-sm font-bold">
          {pause.paused ? t(`${c}.pause.isPaused`, { since: pause.since ? dateTime(new Date(pause.since), locale) : "" }) : t(`${c}.pause.isRunning`)}
        </p>
        <form action={setPauseForm}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="paused" value={pause.paused ? "0" : "1"} />
          <button className={`h-11 rounded-full px-6 text-sm font-bold ${pause.paused ? "bg-accent text-[var(--accent-fg)]" : "bg-danger text-white"}`}>
            {pause.paused ? t(`${c}.pause.resume`) : t(`${c}.pause.pause`)}
          </button>
        </form>
      </section>

      <section aria-labelledby="access" className={`space-y-4 rounded-sedan border p-5 ${access === "all_verified" ? "border-accent bg-accent-soft/30" : "border-border bg-surface"}`}>
        <div className="space-y-1">
          <h2 id="access" className="font-display text-xl font-medium">
            {t(`${c}.access.title`)}
          </h2>
          <p className="max-w-3xl text-sm text-fg-muted">{t(`${c}.access.lead`)}</p>
        </div>
        <p className="text-sm font-bold">{t(`${c}.access.now`, { choice: t(`${c}.access.${access}`) })}</p>
        {sp.confirm && (
          <p role="alert" className="text-sm font-bold text-danger">
            {t(`${c}.access.needConfirm`)}
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1 text-sm">
            <p className="font-bold">{t(`${c}.access.capsTitle`)}</p>
            <ul className="list-disc space-y-0.5 pl-5 text-fg-muted">
              {PlanB2C.options.map((p) => (
                <li key={p}>
                  {t(`${c}.access.planCap`, { plan: t(`${c}.access.plans.${p}`), searches: allowanceFor(p).count, slots: searchPaceFor(p).slots })}
                </li>
              ))}
              <li>{t(`${c}.access.costCeiling`, { usd: searchCostCeilingUsd() })}</li>
              {ai.map((s) => (
                <li key={s.provider}>
                  {s.monthlyBudgetCents === null
                    ? t(`${c}.access.noBudget`, { provider: PROVIDER_LABEL[s.provider] })
                    : t(`${c}.access.budget`, {
                        provider: PROVIDER_LABEL[s.provider],
                        budget: usd(s.monthlyBudgetCents) ?? "",
                        spent: usd(s.monthSpendCents ?? 0) ?? "",
                      })}
                </li>
              ))}
            </ul>
          </div>
          <form action={setSearchAccessForm} className="space-y-3">
            <input type="hidden" name="locale" value={locale} />
            <fieldset className="space-y-2">
              <legend className="sr-only">{t(`${c}.access.title`)}</legend>
              {(["test_only", "all_verified"] as const).map((v) => (
                <label key={v} className="flex cursor-pointer items-start gap-2 rounded-sedan border border-border bg-surface p-3 text-sm">
                  <input type="radio" name="access" value={v} defaultChecked={access === v} className="mt-1" />
                  <span>
                    <span className="font-bold">{t(`${c}.access.${v}`)}</span>
                    <span className="block text-fg-muted">{t(`${c}.access.${v}Hint`)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="confirm" value="yes" className="mt-1" />
              <span>{t(`${c}.access.confirm`)}</span>
            </label>
            <button className="h-11 rounded-full bg-accent px-6 text-sm font-bold text-[var(--accent-fg)]">{t(`${c}.access.save`)}</button>
          </form>
        </div>
      </section>

      <section aria-labelledby="email-gate" className={`space-y-3 rounded-sedan border p-5 ${gate.required ? "border-accent bg-accent-soft/30" : "border-border bg-surface"}`}>
        <h2 id="email-gate" className="font-display text-xl font-medium">
          {t(`${c}.emailGate.title`)}
        </h2>
        <p className="max-w-3xl text-sm text-fg-muted">{t(`${c}.emailGate.lead`)}</p>
        <p className="text-sm font-bold">
          {gate.required
            ? t(`${c}.emailGate.isOn`, { since: gate.since ? dateTime(new Date(gate.since), locale) : "" })
            : t(`${c}.emailGate.isOff`)}
        </p>
        {gate.required && !canSendCodes && (
          <p role="alert" className="text-sm font-bold text-danger">{t(`${c}.emailGate.noSender`)}</p>
        )}
        {sp.gateConfirm && (
          <p role="alert" className="text-sm font-bold text-danger">{t(`${c}.emailGate.needConfirm`)}</p>
        )}
        <form action={setEmailGateForm} className="space-y-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="required" value={gate.required ? "0" : "1"} />
          {!gate.required && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="confirm" value="yes" className="mt-1" />
              <span>{t(`${c}.emailGate.confirm`)}</span>
            </label>
          )}
          <button className={`h-11 rounded-full px-6 text-sm font-bold ${gate.required ? "border border-border-strong text-fg" : "bg-accent text-[var(--accent-fg)]"}`}>
            {gate.required ? t(`${c}.emailGate.turnOff`) : t(`${c}.emailGate.turnOn`)}
          </button>
        </form>
      </section>

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
      <section aria-labelledby="texts" className="space-y-2">
        <h2 id="texts" className="font-display text-xl font-medium">
          {t(`${c}.texts.title`)}
        </h2>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={smsConfig() ? "success" : "neutral"}>{smsConfig() ? t(`${c}.texts.on`) : t(`${c}.texts.off`)}</Badge>
          <span className="text-fg-muted">{t(`${c}.texts.lead`)}</span>
        </p>
      </section>
    </div>
  );
}
