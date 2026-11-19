"use client";

import { useActionState, useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ActionErrorMessage } from "@/components/app/action-error";
import { submitLimelightLead, type LimelightLeadState } from "@/app/actions/limelight";
import {
  LIMELIGHT_BUDGETS,
  LIMELIGHT_CONTACT_PREFS,
  LIMELIGHT_DISCIPLINES,
  LIMELIGHT_NEEDS,
} from "@/domain/limelight";
import { cn } from "@/lib/utils";

/**
 * "Start your site": the one form on the Limelight page. Both paths (talk to
 * us first, or get started) land here in phase 1; the photo upload intake
 * arrives in phase 2. Choice groups are radio chips so every option is visible
 * on a phone without opening a menu.
 */
export function LimelightContactForm() {
  const t = useTranslations("talents.limelight.contact");
  const locale = useLocale();
  const [state, action, pending] = useActionState<LimelightLeadState, FormData>(
    submitLimelightLead,
    undefined
  );
  const id = useId();

  if (state?.ok) {
    return (
      <div
        role="status"
        className="flex flex-col items-start gap-4 self-start rounded-[10px] border border-border bg-bg p-[clamp(24px,3vw,40px)]"
      >
        <span className="flex size-11 items-center justify-center rounded-[8px] bg-accent text-accent-fg">
          <Check className="size-5" />
        </span>
        <h3 className="text-[22px] font-semibold">{t("successTitle")}</h3>
        {state.email && (
          <p className="text-[16px] text-fg-muted">{t("successBody", { email: state.email })}</p>
        )}
      </div>
    );
  }

  const error = state && !state.ok ? state.error : undefined;

  return (
    <form
      action={action}
      noValidate
      className="grid gap-6 rounded-[10px] border border-border bg-bg p-[clamp(20px,3vw,36px)]"
    >
      <input type="hidden" name="locale" value={locale} />
      {/* Honeypot: hidden from people and screen readers, tempting to bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Company
          <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={`${id}-name`} label={t("name")}>
          <Input id={`${id}-name`} name="name" autoComplete="name" required />
        </Field>
        <Field id={`${id}-email`} label={t("email")}>
          <Input id={`${id}-email`} name="email" type="email" autoComplete="email" required />
        </Field>
      </div>

      <Chips
        legend={t("discipline")}
        name="discipline"
        options={LIMELIGHT_DISCIPLINES.map((v) => ({ value: v, label: t(`disciplines.${v}`) }))}
        defaultValue="actor"
      />
      <Chips
        legend={t("need")}
        name="need"
        options={LIMELIGHT_NEEDS.map((v) => ({ value: v, label: t(`needs.${v}`) }))}
        defaultValue="new"
      />
      <Chips
        legend={t("budget")}
        name="budget"
        options={LIMELIGHT_BUDGETS.map((v) => ({ value: v, label: t(`budgets.${v}`) }))}
        defaultValue="unsure"
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Chips
          legend={t("contactPref")}
          name="contactPref"
          options={LIMELIGHT_CONTACT_PREFS.map((v) => ({ value: v, label: t(`prefs.${v}`) }))}
          defaultValue="email"
        />
        <Field id={`${id}-phone`} label={t("phone")}>
          <Input id={`${id}-phone`} name="phone" type="tel" autoComplete="tel" />
        </Field>
      </div>

      <Field id={`${id}-message`} label={t("message")} hint={t("messageHint")}>
        <textarea
          id={`${id}-message`}
          name="message"
          rows={4}
          aria-describedby={`${id}-message-hint`}
          className="w-full rounded-sedan border border-field bg-surface px-3 py-2.5 text-base text-fg shadow-sm transition-colors placeholder:text-fg-subtle focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:text-sm"
        />
      </Field>

      <ActionErrorMessage error={error} />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t("sending") : t("submit")}
        </Button>
        <p className="text-[13px] text-fg-subtle">{t("privacy")}</p>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-[13px] text-fg-subtle">
          {hint}
        </p>
      )}
    </div>
  );
}

/** A radio group drawn as chips. Native inputs, so keyboard arrows work. */
function Chips({
  legend,
  name,
  options,
  defaultValue,
}: {
  legend: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue: string;
}) {
  return (
    <fieldset className="grid gap-2.5">
      <legend className="mb-2.5 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={o.value === defaultValue}
              className="peer sr-only"
            />
            <span
              className={cn(
                "inline-flex min-h-10 items-center rounded-[var(--btn-radius)] border border-field bg-surface px-3.5 text-[14px] transition-colors",
                "hover:border-accent",
                "peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-medium peer-checked:text-accent",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg"
              )}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
