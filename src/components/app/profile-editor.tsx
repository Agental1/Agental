"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { MediaManager, type MediaItem } from "./media-manager";
import { cn } from "@/lib/utils";
import type { PhysicalTraits } from "@/domain/json";
import {
  saveProfileIdentity,
  saveProfilePhysical,
  saveProfileSpecialties,
  savePreferences,
} from "@/app/actions/profile";

const SPECIALTIES = [
  { kind: "figuration", label: "Figuration" },
  { kind: "silhouette", label: "Silhouette" },
  { kind: "seconds-roles", label: "Seconds rôles" },
  { kind: "publicite", label: "Publicité" },
  { kind: "photo", label: "Photo" },
  { kind: "voix", label: "Voix & doublage" },
  { kind: "enfants", label: "Enfants & ados" },
  { kind: "createurs", label: "Créateurs" },
];

export interface ProfileEditorData {
  stageName: string;
  legalName: string;
  phone: string;
  city: string;
  bio: string;
  birthDate: string;
  physical: PhysicalTraits;
  specialties: string[];
  minRateEuros?: number;
  completeness: number;
  media: MediaItem[];
  preferences: {
    autoApply: boolean;
    dailyCap?: number;
    nudity: boolean;
    animals: boolean;
  };
}

function splitList(v: string) {
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

export function ProfileEditor({ initial }: { initial: ProfileEditorData }) {
  const [data, setData] = useState(initial);

  return (
    <div className="space-y-6">
      <Completeness value={data.completeness} />
      <Tabs defaultValue="identite">
        <TabsList className="flex-wrap">
          <TabsTrigger value="identite">Identité</TabsTrigger>
          <TabsTrigger value="physique">Physique</TabsTrigger>
          <TabsTrigger value="medias">Médias</TabsTrigger>
          <TabsTrigger value="specialites">Spécialités</TabsTrigger>
          <TabsTrigger value="preferences">Préférences</TabsTrigger>
        </TabsList>

        <TabsContent value="identite">
          <IdentityTab data={data} setData={setData} />
        </TabsContent>
        <TabsContent value="physique">
          <PhysicalTab data={data} setData={setData} />
        </TabsContent>
        <TabsContent value="medias">
          <MediaManager media={data.media} />
        </TabsContent>
        <TabsContent value="specialites">
          <SpecialtiesTab data={data} setData={setData} />
        </TabsContent>
        <TabsContent value="preferences">
          <PreferencesTab data={data} setData={setData} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Completeness({ value }: { value: number }) {
  return (
    <div className="rounded-sedan border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-accent" />
          Complétude du profil
        </span>
        <span className="font-display text-lg">{value}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
      {value < 100 && (
        <p className="mt-2 text-xs text-fg-muted">
          Ton profil gagnerait à être complété — plus il est riche, plus l&apos;IA
          le fait performer.
        </p>
      )}
    </div>
  );
}

type TabProps = {
  data: ProfileEditorData;
  setData: React.Dispatch<React.SetStateAction<ProfileEditorData>>;
};

function useSave(fn: (input: unknown) => Promise<{ ok: boolean; error?: string; completeness?: number }>) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  function save(input: unknown, onDone?: (c?: number) => void) {
    setError(undefined);
    setSaved(false);
    start(async () => {
      const res = await fn(input);
      if (!res.ok) return setError(res.error ?? "Erreur.");
      setSaved(true);
      onDone?.(res.completeness);
      setTimeout(() => setSaved(false), 2000);
    });
  }
  return { save, pending, saved, error };
}

function SaveBar({
  pending,
  saved,
  error,
  onSave,
}: {
  pending: boolean;
  saved: boolean;
  error?: string;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <Button onClick={onSave} disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        Enregistrer
      </Button>
      {saved && (
        <span className="flex items-center gap-1 text-sm text-success">
          <Check className="size-4" /> Enregistré
        </span>
      )}
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function IdentityTab({ data, setData }: TabProps) {
  const { save, pending, saved, error } = useSave(saveProfileIdentity);
  return (
    <div className="max-w-xl space-y-4">
      <Field label="Nom artistique">
        <Input value={data.stageName} onChange={(e) => setData({ ...data, stageName: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date de naissance">
          <Input type="date" value={data.birthDate} onChange={(e) => setData({ ...data, birthDate: e.target.value })} />
        </Field>
        <Field label="Ville">
          <Input value={data.city} onChange={(e) => setData({ ...data, city: e.target.value })} />
        </Field>
      </div>
      <Field label="Téléphone">
        <Input value={data.phone} onChange={(e) => setData({ ...data, phone: e.target.value })} />
      </Field>
      <Field label="Bio">
        <textarea
          value={data.bio}
          onChange={(e) => setData({ ...data, bio: e.target.value })}
          rows={4}
          maxLength={600}
          className="w-full rounded-sedan border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          placeholder="Quelques lignes sur ton parcours, ce qui te rend unique…"
        />
      </Field>
      <SaveBar
        pending={pending}
        saved={saved}
        error={error}
        onSave={() =>
          save(
            {
              stageName: data.stageName,
              phone: data.phone,
              city: data.city,
              bio: data.bio,
              birthDate: data.birthDate || undefined,
            },
            (c) => c != null && setData((d) => ({ ...d, completeness: c }))
          )
        }
      />
    </div>
  );
}

function PhysicalTab({ data, setData }: TabProps) {
  const { save, pending, saved, error } = useSave(saveProfilePhysical);
  const p = data.physical;
  const setP = (patch: Partial<PhysicalTraits>) =>
    setData({ ...data, physical: { ...p, ...patch } });
  return (
    <div className="max-w-xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Taille (cm)">
          <Input type="number" value={p.heightCm ?? ""} onChange={(e) => setP({ heightCm: e.target.value ? Number(e.target.value) : undefined })} />
        </Field>
        <Field label="Corpulence">
          <Input value={p.build ?? ""} onChange={(e) => setP({ build: e.target.value })} />
        </Field>
        <Field label="Cheveux">
          <Input value={p.hair ?? ""} onChange={(e) => setP({ hair: e.target.value })} />
        </Field>
        <Field label="Yeux">
          <Input value={p.eyes ?? ""} onChange={(e) => setP({ eyes: e.target.value })} />
        </Field>
      </div>
      <Field label="Langues (virgules)">
        <Input value={p.languages.join(", ")} onChange={(e) => setP({ languages: splitList(e.target.value) })} />
      </Field>
      <Field label="Accents (virgules)">
        <Input value={p.accents.join(", ")} onChange={(e) => setP({ accents: splitList(e.target.value) })} />
      </Field>
      <SaveBar pending={pending} saved={saved} error={error} onSave={() => save(p, (c) => c != null && setData((d) => ({ ...d, completeness: c })))} />
    </div>
  );
}

function SpecialtiesTab({ data, setData }: TabProps) {
  const { save, pending, saved, error } = useSave(saveProfileSpecialties);
  return (
    <div className="max-w-xl space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SPECIALTIES.map((s) => {
          const active = data.specialties.includes(s.kind);
          return (
            <button
              key={s.kind}
              type="button"
              onClick={() =>
                setData({
                  ...data,
                  specialties: active
                    ? data.specialties.filter((k) => k !== s.kind)
                    : [...data.specialties, s.kind],
                })
              }
              className={cn(
                "rounded-sedan border px-3 py-2.5 text-sm transition-colors",
                active ? "border-accent bg-accent-soft text-accent" : "border-border hover:border-accent"
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <Field label="Cachet minimum (€/jour)">
        <Input type="number" value={data.minRateEuros ?? ""} onChange={(e) => setData({ ...data, minRateEuros: e.target.value ? Number(e.target.value) : undefined })} />
      </Field>
      <SaveBar
        pending={pending}
        saved={saved}
        error={error}
        onSave={() =>
          save(
            {
              specialties: data.specialties.map((kind) => ({ kind, level: "BEGINNER" })),
              mobilityCountries: ["FR"],
              minRateEuros: data.minRateEuros,
            },
            (c) => c != null && setData((d) => ({ ...d, completeness: c }))
          )
        }
      />
    </div>
  );
}

function PreferencesTab({ data, setData }: TabProps) {
  const { save, pending, saved, error } = useSave(savePreferences);
  const pr = data.preferences;
  const setPr = (patch: Partial<ProfileEditorData["preferences"]>) =>
    setData({ ...data, preferences: { ...pr, ...patch } });
  return (
    <div className="max-w-xl space-y-4">
      <Toggle label="Auto-candidature par l'IA" hint="L'IA postule pour toi (Pro)" checked={pr.autoApply} onChange={(v) => setPr({ autoApply: v })} />
      <Field label="Plafond de candidatures / jour">
        <Input type="number" value={pr.dailyCap ?? ""} onChange={(e) => setPr({ dailyCap: e.target.value ? Number(e.target.value) : undefined })} />
      </Field>
      <Toggle label="J'accepte les rôles avec nudité" checked={pr.nudity} onChange={(v) => setPr({ nudity: v })} />
      <Toggle label="Je peux jouer avec des animaux" checked={pr.animals} onChange={(v) => setPr({ animals: v })} />
      <SaveBar pending={pending} saved={saved} error={error} onSave={() => save(pr)} />
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
      <span>
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-fg-muted">{hint}</span>}
      </span>
    </label>
  );
}
