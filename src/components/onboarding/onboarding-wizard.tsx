"use client";

import { SpecialtyKind } from "@/domain/enums";
import { useTranslations } from "next-intl";
import { useActionErrorText } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";
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
import type { PhysicalTraits } from "@/domain/json";
import {
  saveIdentity,
  savePhysical,
  saveSpecialties,
  signMandat,
} from "@/app/actions/onboarding";

/**
 * Specialty kinds come from the Zod enum, which is what the database stores.
 * Only their labels are translated (app.specialties.<kind>), and the kind is
 * never touched — this list used to be duplicated verbatim here and in
 * profile-editor.tsx, so a label edit in one place silently diverged.
 */
const SPECIALTY_KINDS = SpecialtyKind.options;

const STEP_KEYS = ["identity", "physical", "media", "specialties", "mandat"] as const;

export interface OnboardingInitial {
  stageName: string;
  legalName: string;
  phone: string;
  city: string;
  birthDate: string;
  physical: PhysicalTraits;
  specialties: string[];
  mobilityCountries: string[];
  minRateEuros?: number;
}

export function OnboardingWizard({ initial }: { initial: OnboardingInitial }) {
  const t = useTranslations("talents");
  const ta = useTranslations("app");
  const [step, setStep] = useState(0);
  const [data, setData] = useState(initial);
  const [error, setError] = useState<ActionError | undefined>();
  const errorText = useActionErrorText();
  const [pending, startTransition] = useTransition();

  function set<K extends keyof OnboardingInitial>(
    key: K,
    value: OnboardingInitial[K]
  ) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function next(save?: () => Promise<{ ok: boolean; error?: ActionError }>) {
    setError(undefined);
    startTransition(async () => {
      if (save) {
        const res = await save();
        if (!res.ok) {
          setError(res.error ?? err("errors.generic"));
          return;
        }
      }
      setStep((s) => Math.min(STEP_KEYS.length - 1, s + 1));
    });
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
              />
            </Field>
            <Field label={t("onboarding.identity.legalName")}>
              <Input
                value={data.legalName}
                onChange={(e) => set("legalName", e.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("onboarding.identity.birthDate")}>
                <Input
                  type="date"
                  value={data.birthDate}
                  onChange={(e) => set("birthDate", e.target.value)}
                />
              </Field>
              <Field label={t("onboarding.identity.city")}>
                <Input
                  value={data.city}
                  onChange={(e) => set("city", e.target.value)}
                  placeholder={t("onboarding.identity.cityPlaceholder")}
                />
              </Field>
            </div>
            <Field label={t("onboarding.identity.phone")}>
              <Input
                value={data.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
            <Nav
              pending={pending}
              onNext={() =>
                next(() =>
                  saveIdentity({
                    stageName: data.stageName,
                    legalName: data.legalName,
                    phone: data.phone,
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
            title={t("onboarding.physical.title")}
            subtitle={t("onboarding.physical.subtitle")}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("onboarding.physical.height")}>
                <Input
                  type="number"
                  value={data.physical.heightCm ?? ""}
                  onChange={(e) =>
                    set("physical", {
                      ...data.physical,
                      heightCm: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                />
              </Field>
              <Field label={t("onboarding.physical.build")}>
                <Input
                  value={data.physical.build ?? ""}
                  onChange={(e) =>
                    set("physical", { ...data.physical, build: e.target.value })
                  }
                  placeholder={t("onboarding.physical.buildPlaceholder")}
                />
              </Field>
              <Field label={t("onboarding.physical.hair")}>
                <Input
                  value={data.physical.hair ?? ""}
                  onChange={(e) =>
                    set("physical", { ...data.physical, hair: e.target.value })
                  }
                />
              </Field>
              <Field label={t("onboarding.physical.eyes")}>
                <Input
                  value={data.physical.eyes ?? ""}
                  onChange={(e) =>
                    set("physical", { ...data.physical, eyes: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label={t("onboarding.physical.languages")}>
              <Input
                value={data.physical.languages.join(", ")}
                onChange={(e) =>
                  set("physical", {
                    ...data.physical,
                    languages: splitList(e.target.value),
                  })
                }
                placeholder={t("onboarding.physical.languagesPlaceholder")}
              />
            </Field>
            <Field label={t("onboarding.physical.accents")}>
              <Input
                value={data.physical.accents.join(", ")}
                onChange={(e) =>
                  set("physical", {
                    ...data.physical,
                    accents: splitList(e.target.value),
                  })
                }
                placeholder={t("onboarding.physical.accentsPlaceholder")}
              />
            </Field>
            <Nav
              pending={pending}
              onBack={() => setStep(0)}
              onNext={() => next(() => savePhysical(data.physical))}
            />
          </Step>
        )}

        {step === 2 && (
          <Step
            title={t("onboarding.media.title")}
            subtitle={t("onboarding.media.subtitle")}
          >
            <div className="flex items-start gap-3 rounded-sedan border border-border bg-surface-2/60 p-4 text-sm text-fg-muted">
              <Info className="mt-0.5 size-4 shrink-0 text-accent" />
              <p>{t("onboarding.media.note")}</p>
            </div>
            <Nav
              pending={pending}
              onBack={() => setStep(1)}
              nextLabel={t("onboarding.media.skip")}
              onNext={() => next()}
            />
          </Step>
        )}

        {step === 3 && (
          <Step
            title={t("onboarding.specialties.title")}
            subtitle={t("onboarding.specialties.subtitle")}
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SPECIALTY_KINDS.map((kind) => {
                const active = data.specialties.includes(kind);
                return (
                  <button
                    key={kind}
                    type="button"
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
            <Field label={t("onboarding.specialties.minRate")}>
              <Input
                type="number"
                value={data.minRateEuros ?? ""}
                onChange={(e) =>
                  set(
                    "minRateEuros",
                    e.target.value ? Number(e.target.value) : undefined
                  )
                }
                placeholder="120"
              />
            </Field>
            <Nav
              pending={pending}
              onBack={() => setStep(2)}
              onNext={() =>
                next(() =>
                  saveSpecialties({
                    specialties: data.specialties.map((kind) => ({
                      kind,
                      level: "BEGINNER",
                    })),
                    mobilityCountries: data.mobilityCountries.length
                      ? data.mobilityCountries
                      : ["FR"],
                    minRateEuros: data.minRateEuros,
                  })
                )
              }
            />
          </Step>
        )}

        {step === 4 && <MandatStep />}
      </div>
    </div>
  );
}

function MandatStep() {
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
              await signMandat();
            } catch (e) {
              // redirect throws — only real errors reach here
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
  nextLabel,
}: {
  onNext: () => void;
  onBack?: () => void;
  pending: boolean;
  nextLabel?: string;
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
        {nextLabel ?? t("onboarding.continue")} {!pending && <ArrowRight />}
      </Button>
    </div>
  );
}

function splitList(v: string): string[] {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
