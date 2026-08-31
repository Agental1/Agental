"use client";

import { useTranslations } from "next-intl";
import { useActionErrorText } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";
import { useState, useTransition } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
  MailCheck,
  BadgeCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  saveCastingIdentity,
  saveCastingScope,
  finalizeCastingOnboarding,
} from "@/app/actions/casting-onboarding";

/**
 * Project types: the French label IS the stored value (Organization.scope holds
 * these strings verbatim). Translating them would rewrite existing data, so the
 * stored value stays put and only `id` drives the displayed label.
 *
 * A future migration could move the stored side to ids; until then, changing
 * `value` here would silently orphan every organisation already scoped.
 */
const PROJECT_TYPES = [
  { id: "long", value: "Long métrage" },
  { id: "serie", value: "Série" },
  { id: "pub", value: "Publicité" },
  { id: "court", value: "Court métrage" },
  { id: "clip", value: "Clip" },
  { id: "theatre", value: "Théâtre" },
] as const;

const STEP_KEYS = ["identity", "scope", "verify"] as const;

export interface CastingInitial {
  organizationName: string;
  siret: string;
  projectTypes: string[];
  zones: string[];
}

export function CastingOnboardingWizard({
  initial,
}: {
  initial: CastingInitial;
}) {
  const t = useTranslations("casting");
  const ta = useTranslations("app");
  const [step, setStep] = useState(0);
  const [data, setData] = useState(initial);
  const [error, setError] = useState<ActionError | undefined>();
  const errorText = useActionErrorText();
  const [pending, startTransition] = useTransition();

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

      <div className="mt-6 space-y-5">
        {step === 0 && (
          <>
            <Head
              title={t("onboarding.identity.title")}
              subtitle={t("onboarding.identity.subtitle")}
            />
            <Field label={t("onboarding.identity.orgName")} required>
              <Input
                value={data.organizationName}
                onChange={(e) =>
                  setData({ ...data, organizationName: e.target.value })
                }
                placeholder={t("onboarding.identity.orgNamePlaceholder")}
              />
            </Field>
            <Field label={t("onboarding.identity.siret")}>
              <Input
                value={data.siret}
                onChange={(e) => setData({ ...data, siret: e.target.value })}
                placeholder="12345678901234"
                inputMode="numeric"
              />
            </Field>
            <p className="text-xs text-fg-subtle">
              {t("onboarding.identity.siretNote")}
            </p>
            <Nav
              pending={pending}
              onNext={() =>
                next(() =>
                  saveCastingIdentity({
                    organizationName: data.organizationName,
                    siret: data.siret || "",
                  })
                )
              }
            />
          </>
        )}

        {step === 1 && (
          <>
            <Head
              title={t("onboarding.scope.title")}
              subtitle={t("onboarding.scope.subtitle")}
            />
            <div>
              <Label>{t("onboarding.scope.projectTypes")}</Label>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PROJECT_TYPES.map((pt) => {
                  const active = data.projectTypes.includes(pt.value);
                  return (
                    <button
                      key={pt.id}
                      type="button"
                      onClick={() =>
                        setData({
                          ...data,
                          projectTypes: active
                            ? data.projectTypes.filter((x) => x !== pt.value)
                            : [...data.projectTypes, pt.value],
                        })
                      }
                      className={cn(
                        "rounded-sedan border px-3 py-2.5 text-sm transition-colors",
                        active
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-border hover:border-accent"
                      )}
                    >
                      {ta(`projectTypes.${pt.id}`)}
                    </button>
                  );
                })}
              </div>
            </div>
            <Field label={t("onboarding.scope.zones")}>
              <Input
                value={data.zones.join(", ")}
                onChange={(e) =>
                  setData({
                    ...data,
                    zones: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder={t("onboarding.scope.zonesPlaceholder")}
              />
            </Field>
            <Nav
              pending={pending}
              onBack={() => setStep(0)}
              onNext={() =>
                next(() =>
                  saveCastingScope({
                    projectTypes: data.projectTypes,
                    zones: data.zones,
                  })
                )
              }
            />
          </>
        )}

        {step === 2 && <VerifyStep />}
      </div>
    </div>
  );
}

function VerifyStep() {
  const t = useTranslations("casting");
  const errorText = useActionErrorText();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | undefined>();
  return (
    <>
      <Head
        title={t("onboarding.verify.title")}
        subtitle={t("onboarding.verify.subtitle")}
      />
      <div className="flex items-start gap-3 rounded-sedan border border-border bg-surface p-5">
        <MailCheck className="mt-0.5 size-5 shrink-0 text-accent" />
        <div className="text-sm text-fg-muted">
          <p className="font-medium text-fg">{t("onboarding.verify.sent")}</p>
          <p className="mt-1">{t("onboarding.verify.demo")}</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {errorText(error)}
        </p>
      )}
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(undefined);
            try {
              await finalizeCastingOnboarding();
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
              setError(err("errors.confirmFailed"));
            }
          })
        }
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        <BadgeCheck className="size-4" /> {t("onboarding.verify.submit")}
      </Button>
    </>
  );
}

function Progress({ step }: { step: number }) {
  const t = useTranslations("casting");
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

function Head({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="font-display text-2xl font-medium">{title}</h1>
      <p className="text-sm text-fg-muted">{subtitle}</p>
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
  const t = useTranslations("casting");
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
