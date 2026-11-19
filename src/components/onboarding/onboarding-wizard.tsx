"use client";

import { SpecialtyKind } from "@/domain/enums";
import { useTranslations } from "next-intl";
import { useActionErrorText } from "@/components/app/action-error";
import { HeightField } from "@/components/app/height-field";
import { err, type ActionError } from "@/domain/action-result";
import type { HeightValue } from "@/domain/height";
import { useState, useTransition } from "react";
import {
  Check,
  ArrowRight,
  ArrowLeft,
  Loader2,
  ShieldCheck,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  saveIdentity,
  saveProfileBasics,
  signMandat,
} from "@/app/actions/onboarding";

/**
 * Specialty kinds come from the Zod enum, which is what the database stores.
 * Only their labels are translated (app.specialties.<kind>), and the kind is
 * never touched — this list used to be duplicated verbatim here and in
 * profile-editor.tsx, so a label edit in one place silently diverged.
 */
const SPECIALTY_KINDS = SpecialtyKind.options;

/**
 * Three steps, the minimum to be represented. Physical details, photos and
 * videos moved to the profile editor, where the dashboard's "Complete your
 * profile" card sends the talent after signing.
 */
const STEP_KEYS = ["identity", "profile", "mandat"] as const;

export interface OnboardingInitial {
  stageName: string;
  city: string;
  birthDate: string;
  heightCm?: number;
  specialties: string[];
}

export function OnboardingWizard({ initial }: { initial: OnboardingInitial }) {
  const t = useTranslations("talents");
  const ta = useTranslations("app");
  const [step, setStep] = useState(0);
  const [data, setData] = useState(initial);
  // Untouched, the stored height goes back as exact centimeters.
  const [height, setHeight] = useState<HeightValue | undefined>(
    initial.heightCm != null ? { unit: "metric", cm: initial.heightCm } : undefined
  );
  const [error, setError] = useState<ActionError | undefined>();
  const errorText = useActionErrorText();
  const [pending, startTransition] = useTransition();

  function set<K extends keyof OnboardingInitial>(
    key: K,
    value: OnboardingInitial[K]
  ) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function next(save: () => Promise<{ ok: boolean; error?: ActionError }>) {
    setError(undefined);
    startTransition(async () => {
      const res = await save();
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
          <Step title={t("onboarding.identity.title")} subtitle={t("onboarding.identity.subtitle")}>
            <Field label={t("onboarding.identity.stageName")} required>
              <Input
                value={data.stageName}
                onChange={(e) => set("stageName", e.target.value)}
                placeholder={t("onboarding.identity.stageNamePlaceholder")}
                autoComplete="nickname"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("onboarding.identity.birthDate")} required>
                <Input
                  type="date"
                  value={data.birthDate}
                  onChange={(e) => set("birthDate", e.target.value)}
                  autoComplete="bday"
                />
              </Field>
              <Field label={t("onboarding.identity.city")}>
                <Input
                  value={data.city}
                  onChange={(e) => set("city", e.target.value)}
                  placeholder={t("onboarding.identity.cityPlaceholder")}
                  autoComplete="address-level2"
                />
              </Field>
            </div>
            <Nav
              pending={pending}
              onNext={() =>
                next(() =>
                  saveIdentity({
                    stageName: data.stageName,
                    city: data.city,
                    birthDate: data.birthDate || undefined,
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
          >
            <Field label={t("onboarding.profile.specialties")} required>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SPECIALTY_KINDS.map((kind) => {
                  const active = data.specialties.includes(kind);
                  return (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        set(
                          "specialties",
                          active
                            ? data.specialties.filter((k) => k !== kind)
                            : [...data.specialties, kind]
                        )
                      }
                      className={cn(
                        "rounded-sedan border px-3 py-3 text-sm transition-colors",
                        active
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-border hover:border-accent"
                      )}
                    >
                      {ta(`specialties.${kind}`)}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="sm:max-w-xs">
              {/* Every step change unmounts this field. It reopens on the
                  height Continue will send, never on the page-load value. */}
              <HeightField
                label={t("onboarding.profile.height")}
                defaultValue={height}
                onChange={setHeight}
              />
            </div>
            <Nav
              pending={pending}
              onBack={() => back(0)}
              onNext={() =>
                next(() =>
                  saveProfileBasics({ specialties: data.specialties, height })
                )
              }
            />
          </Step>
        )}

        {step === 2 && <MandatStep onBack={() => back(1)} />}
      </div>
    </div>
  );
}

function MandatStep({ onBack }: { onBack: () => void }) {
  const t = useTranslations("talents");
  const errorText = useActionErrorText();
  const [accept, setAccept] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | undefined>();

  return (
    <Step
      title={t("onboarding.mandat.title")}
      subtitle={t("onboarding.mandat.subtitle")}
    >
      <div className="space-y-3 rounded-sedan border border-border bg-surface p-5">
        <div className="flex items-center gap-2 text-accent">
          <ShieldCheck className="size-5" />
          <span className="font-medium text-fg">
            {t("onboarding.mandat.free")}
          </span>
        </div>
        <ul className="space-y-2 text-sm text-fg-muted">
          {(t.raw("onboarding.mandat.points") as string[]).map((point) => (
            <li key={point} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-success" />
              {point}
            </li>
          ))}
        </ul>
        <Badge variant="neutral">
          <Info className="size-3" /> {t("onboarding.mandat.read")}
        </Badge>
      </div>

      <label className="mt-4 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={accept}
          onChange={(e) => setAccept(e.target.checked)}
          className="mt-0.5 size-4 accent-[var(--accent)]"
        />
        <span>{t("onboarding.mandat.accept")}</span>
      </label>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {errorText(error)}
        </p>
      )}

      <Button
        className="mt-5 w-full"
        size="lg"
        disabled={!accept || pending}
        onClick={() =>
          startTransition(async () => {
            setError(undefined);
            try {
              // Success redirects (it throws NEXT_REDIRECT); a refusal comes
              // back as a translation key.
              const res = await signMandat({ accept });
              if (!res.ok) setError(res.error ?? err("errors.signatureFailed"));
            } catch (e) {
              if (
                e &&
                typeof e === "object" &&
                "digest" in e &&
                String((e as { digest: string }).digest).startsWith(
                  "NEXT_REDIRECT"
                )
              ) {
                throw e;
              }
              setError(err("errors.signatureFailed"));
            }
          })
        }
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {t("onboarding.mandat.submit")}
      </Button>
      <Button
        variant="ghost"
        className="mt-2"
        onClick={onBack}
        disabled={pending}
      >
        <ArrowLeft /> {t("onboarding.back")}
      </Button>
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
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-medium">{title}</h1>
        <p className="text-sm text-fg-muted">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-danger"> *</span>}
      </Label>
      {children}
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
