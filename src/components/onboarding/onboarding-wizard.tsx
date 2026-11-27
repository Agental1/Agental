"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionErrorText } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";
import { useRef, useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneField } from "@/components/app/smart-inputs";
import { GENDERS } from "@/domain/identity";
import { cn } from "@/lib/utils";
import { legalCopyParams } from "@/lib/legal-copy";
import { completeBetaOnboarding } from "@/app/actions/onboarding";
import { saveProfileIdentity } from "@/app/actions/profile";

/**
 * Round 10 (founder): the sign-up questions are the profile's own questions,
 * with the same fields and components, saved straight into the profile so
 * they count toward 100%. Quick answers only (typing or one click): legal first
 * and last name and stage name, then date of birth, gender and phone. The city
 * is not asked here; it comes later in the profile. The third screen, which
 * explains the representation agreement, stays.
 */
const STEP_KEYS = ["identity", "profile", "mandat"] as const;

export interface OnboardingInitial {
  legalFirstName: string;
  legalLastName: string;
  stageName: string;
  birthDate: string;
  gender: string;
  genderOther: string;
  phone: string;
  phoneE164: string;
}

export function OnboardingWizard({
  initial,
  initialStep = 0,
}: {
  initial: OnboardingInitial;
  /** Where to resume: the first unfinished step (see src/domain/setup.ts). */
  initialStep?: number;
}) {
  const t = useTranslations("talents");
  const e = "space.profileEditor" as const;
  const [step, setStep] = useState(() =>
    Math.min(Math.max(initialStep, 0), STEP_KEYS.length - 1)
  );
  const [data, setData] = useState(initial);
  const phoneOk = useRef(true);
  const [error, setError] = useState<ActionError | undefined>();
  const errorText = useActionErrorText();
  const [pending, startTransition] = useTransition();

  function set<K extends keyof OnboardingInitial>(key: K, value: OnboardingInitial[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function next(check: () => ActionError | null, save: () => Promise<{ ok: boolean; error?: ActionError }>) {
    setError(undefined);
    const problem = check();
    if (problem) return setError(problem);
    startTransition(async () => {
      const res = await save().catch(() => ({ ok: false, error: err("errors.generic") }));
      if (!res.ok) {
        setError(res.error ?? err("errors.generic"));
        return;
      }
      setStep((s) => Math.min(STEP_KEYS.length - 1, s + 1));
    });
  }

  function back(to: number) {
    setError(undefined);
    setStep(to);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Progress step={step} />

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {errorText(error)}
        </p>
      )}

      <div className="mt-6">
        {step === 0 && (
          <Step
            title={t("onboarding.identity.title")}
            subtitle={t("onboarding.identity.subtitle")}
            why={t("onboarding.identity.why")}
          >
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">
                {t(`${e}.legalName`)}
                <span className="text-danger"> *</span>
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  aria-label={t(`${e}.legalFirstName`)}
                  placeholder={t(`${e}.legalFirstName`)}
                  autoComplete="given-name"
                  value={data.legalFirstName}
                  onChange={(ev) => set("legalFirstName", ev.target.value)}
                />
                <Input
                  aria-label={t(`${e}.legalLastName`)}
                  placeholder={t(`${e}.legalLastName`)}
                  autoComplete="family-name"
                  value={data.legalLastName}
                  onChange={(ev) => set("legalLastName", ev.target.value)}
                />
              </div>
              <p className="text-xs text-fg-muted">{t(`${e}.legalNameHint`)}</p>
            </fieldset>
            <Field label={`${t(`${e}.stageName`)} ${t(`${e}.optional`)}`} hint={t(`${e}.stageNameHint`)}>
              <Input
                aria-label={t(`${e}.stageName`)}
                value={data.stageName}
                onChange={(ev) => set("stageName", ev.target.value)}
                autoComplete="nickname"
              />
            </Field>
            <Nav
              pending={pending}
              onNext={() =>
                next(
                  () => (data.legalFirstName.trim() && data.legalLastName.trim() ? null : err("errors.legalNameRequired")),
                  () =>
                    saveProfileIdentity({
                      legalFirstName: data.legalFirstName,
                      legalLastName: data.legalLastName,
                      stageName: data.stageName,
                    })
                )
              }
            />
          </Step>
        )}

        {step === 1 && (
          <Step
            title={t("onboarding.profile.title")}
            subtitle={t("onboarding.profile.subtitle")}
            why={t("onboarding.profile.why")}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t(`${e}.birthDate`)} required>
                <Input
                  type="date"
                  aria-label={t(`${e}.birthDate`)}
                  value={data.birthDate}
                  onChange={(ev) => set("birthDate", ev.target.value)}
                  autoComplete="bday"
                />
              </Field>
              <Field label={t(`${e}.gender`)} hint={t(`${e}.genderHint`)} required>
                <Select value={data.gender || undefined} onValueChange={(gender) => set("gender", gender)}>
                  <SelectTrigger className="w-full" aria-label={t(`${e}.gender`)}>
                    <SelectValue placeholder={t(`${e}.choose`)} />
                  </SelectTrigger>
                  <SelectContent data-portal="talents">
                    {GENDERS.map((g) => (
                      <SelectItem key={g} value={g}>{t(`${e}.genders.${g}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {data.gender === "other" && (
                  <Input
                    className="mt-2"
                    maxLength={60}
                    aria-label={t(`${e}.genderOther`)}
                    placeholder={t(`${e}.genderOther`)}
                    value={data.genderOther}
                    onChange={(ev) => set("genderOther", ev.target.value)}
                  />
                )}
              </Field>
            </div>
            <Field label={t(`${e}.phone`)} hint={t("onboarding.profile.phoneHint")}>
              <PhoneField
                initialE164={data.phoneE164 || null}
                initialText={data.phone}
                onValid={({ e164, display }) => {
                  phoneOk.current = true;
                  setData((d) => ({ ...d, phone: display, phoneE164: e164 }));
                }}
                onInvalid={() => {
                  phoneOk.current = false;
                }}
                onEmpty={() => {
                  phoneOk.current = true;
                  setData((d) => ({ ...d, phone: "", phoneE164: "" }));
                }}
              />
            </Field>
            <Nav
              pending={pending}
              onBack={() => back(0)}
              onNext={() =>
                next(
                  () => {
                    if (!data.birthDate) return err("errors.birthDateRequired");
                    if (!data.gender) return err("errors.genderRequired");
                    if (!phoneOk.current) return err("errors.phoneInvalid");
                    return null;
                  },
                  () =>
                    saveProfileIdentity({
                      birthDate: data.birthDate,
                      gender: data.gender,
                      ...(data.gender === "other" ? { genderOther: data.genderOther } : {}),
                      ...(data.phoneE164 ? { phone: data.phone, phoneE164: data.phoneE164 } : {}),
                    })
                )
              }
            />
          </Step>
        )}

        {step === 2 && <MandatStep onBack={(to = 1) => back(to)} />}
      </div>
    </div>
  );
}

/**
 * The third step keeps its place and its name, but during the beta it signs
 * nothing: the representation agreement is out until counsel approves a
 * version (src/domain/mandat.ts). The button records that the basics are
 * done (completeBetaOnboarding) and goes where the server says.
 */
function MandatStep({ onBack }: { onBack: (to?: number) => void }) {
  const t = useTranslations("talents");
  const tl = useTranslations("common.legalCopy");
  const params = legalCopyParams(useLocale());
  const router = useRouter();
  const errorText = useActionErrorText();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | undefined>();

  function finish() {
    startTransition(async () => {
      setError(undefined);
      try {
        const res = await completeBetaOnboarding();
        if (!res.ok) {
          setError(res.error);
          return;
        }
        // A step still missing (another tab cleared it): back to that step.
        if (res.nextStep) {
          setError(err("errors.onboardingIncomplete"));
          onBack(res.nextStep === "identity" ? 0 : 1);
          return;
        }
        router.push(res.path);
      } catch {
        setError(err("errors.generic"));
      }
    });
  }

  return (
    <Step
      title={t("onboarding.mandat.title")}
      subtitle={t("onboarding.mandat.subtitle")}
      optional
    >
      <div className="space-y-4 rounded-sedan border border-border bg-surface p-5">
        <h3 className="font-bold">{tl("mandate.summaryTitle")}</h3>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
          <li>{tl("mandate.free")}</li>
          <li>{tl("mandate.commission", params)}</li>
          <li>{tl("mandate.nonExclusive")}</li>
          <li>{tl("mandate.term", params)}</li>
          <li>{tl("mandate.notice", params)}</li>
        </ul>
        <Link
          href="/talents/comment-ca-marche#two-things"
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline md:min-h-0"
        >
          {tl("mandate.fullText")}
        </Link>
        <p className="text-sm text-fg-muted">{tl("beta")}</p>
        <p className="text-sm font-medium">{tl("mandate.noPayment")}</p>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {errorText(error)}
        </p>
      )}

      <Button
        className="mt-5 w-full"
        size="lg"
        disabled={pending}
        onClick={finish}
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {t("onboarding.mandat.submit")}
      </Button>
      <div className="mt-2 flex items-center justify-between">
        <Button variant="ghost" onClick={() => onBack()} disabled={pending}>
          <ArrowLeft /> {t("onboarding.back")}
        </Button>
        {/* Nothing to save on this step: skipping goes where Continue goes. */}
        <Button variant="ghost" onClick={finish} disabled={pending}>
          {t("onboarding.skip")}
        </Button>
      </div>
    </Step>
  );
}
/* ── small building blocks ──────────────────────────────────────────────── */

function Progress({ step }: { step: number }) {
  const t = useTranslations("talents");
  return (
    <div className="flex items-center gap-2">
      {STEP_KEYS.map((key, i) => (
        <div key={key} className="flex flex-1 flex-col gap-1.5">
          <div
            className={cn(
              "h-1 rounded-full",
              i <= step ? "bg-accent" : "bg-surface-2"
            )}
          />
          <span
            className={cn(
              "text-[11px]",
              i === step ? "font-medium text-fg" : "text-fg-subtle"
            )}
          >
            {t(`onboarding.steps.${key}`)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Step({
  title,
  subtitle,
  why,
  optional = false,
  children,
}: {
  title: string;
  subtitle: string;
  /** Required steps say in one line why they are required. */
  why?: string;
  /** Optional steps wear an "Optional" label. */
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-medium">
          {title}
          {optional && <OptionalLabel />}
        </h1>
        <p className="text-sm text-fg-muted">{subtitle}</p>
        {why && <p className="mt-1 text-sm font-medium">{why}</p>}
      </div>
      {children}
    </div>
  );
}

function OptionalLabel() {
  const t = useTranslations("talents");
  return (
    <span className="ml-2 inline-block rounded-full border border-border-strong px-2 py-0.5 align-middle text-[11px] font-bold uppercase leading-none tracking-wide text-fg-muted">
      {t("onboarding.optional")}
    </span>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-danger"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

function Nav({
  onNext,
  onBack,
  pending,
}: {
  onNext: () => void;
  onBack?: () => void;
  pending: boolean;
}) {
  const t = useTranslations("talents");
  return (
    <div className="flex items-center justify-between pt-2">
      {onBack ? (
        <Button variant="ghost" onClick={onBack} disabled={pending}>
          <ArrowLeft /> {t("onboarding.back")}
        </Button>
      ) : (
        <span />
      )}
      <Button onClick={onNext} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {t("onboarding.continue")} {!pending && <ArrowRight />}
      </Button>
    </div>
  );
}
