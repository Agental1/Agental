"use client";

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

const PROJECT_TYPES = [
  "Long métrage",
  "Série",
  "Publicité",
  "Court métrage",
  "Clip",
  "Théâtre",
];

const STEPS = ["Identité", "Périmètre", "Vérification"];

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
  const [step, setStep] = useState(0);
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function next(save?: () => Promise<{ ok: boolean; error?: string }>) {
    setError(undefined);
    startTransition(async () => {
      if (save) {
        const res = await save();
        if (!res.ok) {
          setError(res.error ?? "Une erreur est survenue.");
          return;
        }
      }
      setStep((s) => Math.min(STEPS.length - 1, s + 1));
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Progress step={step} />
      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 space-y-5">
        {step === 0 && (
          <>
            <Head
              title="Votre structure"
              subtitle="On vérifie votre identité professionnelle."
            />
            <Field label="Nom de la structure" required>
              <Input
                value={data.organizationName}
                onChange={(e) =>
                  setData({ ...data, organizationName: e.target.value })
                }
                placeholder="Production, agence, studio…"
              />
            </Field>
            <Field label="SIRET (14 chiffres)">
              <Input
                value={data.siret}
                onChange={(e) => setData({ ...data, siret: e.target.value })}
                placeholder="12345678901234"
                inputMode="numeric"
              />
            </Field>
            <p className="text-xs text-fg-subtle">
              Un SIRET valide active la vérification immédiate. Sinon, votre
              compte reste en attente de revue.
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
              title="Votre périmètre"
              subtitle="Pour calibrer les profils qu'on vous présente."
            />
            <div>
              <Label>Types de projets</Label>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PROJECT_TYPES.map((t) => {
                  const active = data.projectTypes.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setData({
                          ...data,
                          projectTypes: active
                            ? data.projectTypes.filter((x) => x !== t)
                            : [...data.projectTypes, t],
                        })
                      }
                      className={cn(
                        "rounded-sedan border px-3 py-2.5 text-sm transition-colors",
                        active
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-border hover:border-accent"
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
            <Field label="Zones d'intervention (séparées par des virgules)">
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
                placeholder="Paris, Lyon, national"
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <>
      <Head
        title="Dernière étape"
        subtitle="Confirmez votre email pour accéder à vos projets."
      />
      <div className="flex items-start gap-3 rounded-sedan border border-border bg-surface p-5">
        <MailCheck className="mt-0.5 size-5 shrink-0 text-accent" />
        <div className="text-sm text-fg-muted">
          <p className="font-medium text-fg">
            Un email de confirmation vous a été envoyé.
          </p>
          <p className="mt-1">
            Pour cette démo, cliquez ci-dessous pour confirmer et activer votre
            espace gratuit (1 projet actif, 50 candidatures triées / mois).
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
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
              setError("La confirmation a échoué. Réessayez.");
            }
          })
        }
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        <BadgeCheck className="size-4" /> Confirmer et accéder à mes projets
      </Button>
    </>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((label, i) => (
        <div key={label} className="flex flex-1 flex-col gap-1.5">
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
            {label}
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
  return (
    <div className="flex items-center justify-between pt-2">
      {onBack ? (
        <Button variant="ghost" onClick={onBack} disabled={pending}>
          <ArrowLeft /> Retour
        </Button>
      ) : (
        <span />
      )}
      <Button onClick={onNext} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Continuer {!pending && <ArrowRight />}
      </Button>
    </div>
  );
}
