"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ActionErrorMessage } from "@/components/app/action-error";
import { submitLimelightLead, type LimelightLeadState } from "@/app/actions/limelight";
import {
  LIMELIGHT,
  LIMELIGHT_BUDGETS,
  LIMELIGHT_CONTACT_PREFS,
  LIMELIGHT_DISCIPLINES,
  LIMELIGHT_NEEDS,
  type LimelightFormSource,
} from "@/domain/limelight";
import { cn } from "@/lib/utils";

type Pref = (typeof LIMELIGHT_CONTACT_PREFS)[number];

/**
 * "Request my site": the one form on the Limelight page, open to visitors who
 * have no account.
 *
 * Name, email, type of work and what they need; the phone field appears only
 * when they ask for a call. The build price, hosting and renewal terms sit
 * right under the offer choice, read from LIMELIGHT. Every field is
 * controlled, so a failed send keeps what was typed; the button rests while a
 * request is in flight, so a double click sends once. Success shows only after
 * the server answers.
 *
 * `submitLimelightLead` stores the request (one per email) with one team alert
 * through `recordInterest`, the same path as `POST /api/limelight/interest`.
 */
export function LimelightContactForm({
  defaults,
  preview,
  submitLabel,
  source = "limelight-page",
}: {
  /** Values to start from, for a signed-in performer. */
  defaults?: { name?: string; email?: string; message?: string };
  /** Shown above the fields, e.g. the site preview the request is about. */
  preview?: React.ReactNode;
  submitLabel?: string;
  /** Recorded on the lead, so staff see where the request came from. */
  source?: LimelightFormSource;
} = {}) {
  const t = useTranslations("talents.limelight.contact");
  const to = useTranslations("talents.limelight.offers");
  const locale = useLocale();
  const [state, action, pending] = useActionState<LimelightLeadState, FormData>(
    submitLimelightLead,
    undefined
  );
  const id = useId();
  // The confirmation is shorter than the form it replaces, so it can land
  // above the screen: bring it into view and give it focus.
  const successRef = useRef<HTMLDivElement>(null);
  const ok = state?.ok === true;
  useEffect(() => {
    if (!ok) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    successRef.current?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    successRef.current?.focus({ preventScroll: true });
  }, [ok]);

  const [name, setName] = useState(defaults?.name ?? "");
  const [email, setEmail] = useState(defaults?.email ?? "");
  const [discipline, setDiscipline] = useState<string>("actor");
  const [need, setNeed] = useState<string>("new");
  const [budget, setBudget] = useState<string>("unsure");
  const [pref, setPref] = useState<Pref>("email");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(defaults?.message ?? "");

  const usd = (amount: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    }).format(amount);

  if (state?.ok) {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        role="status"
        className="flex scroll-mt-24 flex-col items-start gap-4 self-start rounded-sedan-xl border border-border bg-surface p-[clamp(24px,3vw,40px)] outline-none"
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-fg">
          <Check aria-hidden="true" className="size-5" />
        </span>
        <h3 className="text-[22px] font-bold">{t("successTitle")}</h3>
        <p className="text-[16px] text-fg-muted">{t("successBody", { email: state.email || email })}</p>
      </div>
    );
  }

  const error = state && !state.ok ? state.error : undefined;

  return (
    <form
      action={action}
      noValidate
      className="grid gap-6 rounded-sedan-xl border border-border bg-surface p-[clamp(20px,3vw,36px)]"
    >
      {preview}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="source" value={source} />
      {/* Honeypot: hidden from people and screen readers, tempting to bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Company
          <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={`${id}-name`} label={t("name")}>
          <Input
            id={`${id}-name`}
            name="name"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-12 px-4 text-base sm:h-12 sm:text-base"
          />
        </Field>
        <Field id={`${id}-email`} label={t("email")}>
          <Input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 px-4 text-base sm:h-12 sm:text-base"
          />
        </Field>
      </div>

      <Chips
        legend={t("discipline")}
        name="discipline"
        value={discipline}
        onChange={setDiscipline}
        options={LIMELIGHT_DISCIPLINES.map((v) => ({ value: v, label: t(`disciplines.${v}`) }))}
      />
      <Chips
        legend={t("need")}
        name="need"
        value={need}
        onChange={setNeed}
        options={LIMELIGHT_NEEDS.map((v) => ({ value: v, label: t(`needs.${v}`) }))}
      />
      <div className="grid gap-2">
        <Chips
          legend={t("budget")}
          name="budget"
          value={budget}
          onChange={setBudget}
          options={LIMELIGHT_BUDGETS.map((v) => ({ value: v, label: t(`budgets.${v}`) }))}
        />
        <p className="max-w-[64ch] text-[13.5px] leading-relaxed text-fg-muted">
          {t("terms", {
            essential: to("essential.name"),
            essentialPrice: usd(LIMELIGHT.plans.essential.priceUsd),
            essentialRenewal: usd(LIMELIGHT.plans.essential.renewalUsdPerYear),
            signature: to("signature.name"),
            signaturePrice: usd(LIMELIGHT.plans.signature.priceUsd),
            signatureRenewal: usd(LIMELIGHT.plans.signature.renewalUsdPerYear),
            months: LIMELIGHT.includedProMonths,
          })}
        </p>
      </div>

      <Chips
        legend={t("contactPref")}
        name="contactPref"
        value={pref}
        onChange={(v) => setPref(v as Pref)}
        options={LIMELIGHT_CONTACT_PREFS.map((v) => ({ value: v, label: t(`prefs.${v}`) }))}
      />
      {pref === "call" && (
        <Field id={`${id}-phone`} label={t("phone")}>
          <Input
            id={`${id}-phone`}
            name="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="enter h-12 max-w-sm px-4 text-base sm:h-12 sm:text-base"
          />
        </Field>
      )}

      <Field id={`${id}-message`} label={t("message")} hint={t("messageHint")}>
        <textarea
          id={`${id}-message`}
          name="message"
          rows={3}
          aria-describedby={`${id}-message-hint`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-sedan border border-field bg-surface px-4 py-3 text-base text-fg shadow-sm transition-colors placeholder:text-fg-subtle focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </Field>

      <ActionErrorMessage error={error} />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t("sending") : (submitLabel ?? t("submit"))}
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
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
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
              checked={o.value === value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "pressable inline-flex min-h-11 items-center rounded-full border border-field bg-surface px-4 text-[14.5px] [--hover-scale:1.02] [--press-scale:1.04]",
                "hover:border-accent",
                "peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-bold peer-checked:text-accent",
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
