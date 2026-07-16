"use client";

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

const SPECIALTIES: { kind: string; label: string }[] = [
  { kind: "figuration", label: "Figuration" },
  { kind: "silhouette", label: "Silhouette" },
  { kind: "seconds-roles", label: "Seconds rôles" },
  { kind: "publicite", label: "Publicité" },
  { kind: "photo", label: "Photo" },
  { kind: "voix", label: "Voix & doublage" },
  { kind: "enfants", label: "Enfants & ados" },
  { kind: "createurs", label: "Créateurs" },
];

const STEPS = ["Identité", "Physique", "Médias", "Spécialités", "Mandat"];

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
  const [step, setStep] = useState(0);
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function set<K extends keyof OnboardingInitial>(
    key: K,
    value: OnboardingInitial[K]
  ) {
    setData((d) => ({ ...d, [key]: value }));
  }

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

      <div className="mt-6">
        {step === 0 && (
          <Step title="Qui es-tu ?" subtitle="On commence par les bases.">
            <Field label="Nom artistique" required>
              <Input
                value={data.stageName}
                onChange={(e) => set("stageName", e.target.value)}
                placeholder="Ton nom de scène"
              />
            </Field>
            <Field label="Nom civil (privé)">
              <Input
                value={data.legalName}
                onChange={(e) => set("legalName", e.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date de naissance">
                <Input
                  type="date"
                  value={data.birthDate}
                  onChange={(e) => set("birthDate", e.target.value)}
                />
              </Field>
              <Field label="Ville">
                <Input
                  value={data.city}
                  onChange={(e) => set("city", e.target.value)}
                  placeholder="Lyon"
                />
              </Field>
            </div>
            <Field label="Téléphone">
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
            title="Ton physique"
            subtitle="Ce que les castings recherchent. Tout est optionnel."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Taille (cm)">
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
              <Field label="Corpulence">
                <Input
                  value={data.physical.build ?? ""}
                  onChange={(e) =>
                    set("physical", { ...data.physical, build: e.target.value })
                  }
                  placeholder="mince, athlétique…"
                />
              </Field>
              <Field label="Cheveux">
                <Input
                  value={data.physical.hair ?? ""}
                  onChange={(e) =>
                    set("physical", { ...data.physical, hair: e.target.value })
                  }
                />
              </Field>
              <Field label="Yeux">
                <Input
                  value={data.physical.eyes ?? ""}
                  onChange={(e) =>
                    set("physical", { ...data.physical, eyes: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Langues (séparées par des virgules)">
              <Input
                value={data.physical.languages.join(", ")}
                onChange={(e) =>
                  set("physical", {
                    ...data.physical,
                    languages: splitList(e.target.value),
                  })
                }
                placeholder="français, anglais"
              />
            </Field>
            <Field label="Accents">
              <Input
                value={data.physical.accents.join(", ")}
                onChange={(e) =>
                  set("physical", {
                    ...data.physical,
                    accents: splitList(e.target.value),
                  })
                }
                placeholder="breton, marseillais"
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
            title="Tes médias"
            subtitle="Photos, reel, voix — ce qui te met en valeur."
          >
            <div className="flex items-start gap-3 rounded-sedan border border-border bg-surface-2/60 p-4 text-sm text-fg-muted">
              <Info className="mt-0.5 size-4 shrink-0 text-accent" />
              <p>
                Un reel filmé au téléphone suffit pour commencer. Tu ajouteras
                tes médias depuis ton profil, juste après ton inscription.
              </p>
            </div>
            <Nav
              pending={pending}
              onBack={() => setStep(1)}
              nextLabel="Passer cette étape"
              onNext={() => next()}
            />
          </Step>
        )}

        {step === 3 && (
          <Step
            title="Tes spécialités"
            subtitle="Choisis ce qui te correspond — au moins une."
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SPECIALTIES.map((s) => {
                const active = data.specialties.includes(s.kind);
                return (
                  <button
                    key={s.kind}
                    type="button"
                    onClick={() =>
                      set(
                        "specialties",
                        active
                          ? data.specialties.filter((k) => k !== s.kind)
                          : [...data.specialties, s.kind]
                      )
                    }
                    className={cn(
                      "rounded-sedan border px-3 py-3 text-sm transition-colors",
                      active
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border hover:border-accent"
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            <Field label="Cachet minimum (€/jour, optionnel)">
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
  const [accept, setAccept] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <Step
      title="Ton mandat de représentation"
      subtitle="La dernière étape — et tu es représenté."
    >
      <div className="space-y-3 rounded-sedan border border-border bg-surface p-5">
        <div className="flex items-center gap-2 text-accent">
          <ShieldCheck className="size-5" />
          <span className="font-medium text-fg">
            Gratuit. Sans engagement de ta part. Résiliable quand tu veux.
          </span>
        </div>
        <ul className="space-y-2 text-sm text-fg-muted">
          {[
            "C'est le contrat standard entre un artiste et son agent, encadré par la loi française.",
            "Agental te représente et négocie pour toi. La commission ne s'applique qu'aux cachets décrochés.",
            "Tes médias restent à toi. Tes données sont protégées (RGPD).",
            "L'abonnement payant est un autre choix, plus tard — jamais mêlé au mandat.",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-success" />
              {t}
            </li>
          ))}
        </ul>
        <Badge variant="neutral">
          <Info className="size-3" /> Lire le mandat complet
        </Badge>
      </div>

      <label className="mt-4 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={accept}
          onChange={(e) => setAccept(e.target.checked)}
          className="mt-0.5 size-4 accent-[var(--accent)]"
        />
        <span>
          J&apos;accepte le mandat de représentation et je demande à Agental de
          me représenter.
        </span>
      </label>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
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
              setError("La signature a échoué. Réessaie.");
            }
          })
        }
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        Signer et activer mon compte
      </Button>
    </Step>
  );
}

/* ── small building blocks ──────────────────────────────────────────────── */

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
  nextLabel = "Continuer",
}: {
  onNext: () => void;
  onBack?: () => void;
  pending: boolean;
  nextLabel?: string;
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
        {nextLabel} {!pending && <ArrowRight />}
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
