"use client";

import { useTranslations } from "next-intl";
import { SpecialtyKind } from "@/domain/enums";
import { useActionErrorText } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";
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

// Same source as the onboarding wizard: the Zod enum the database stores.
// These two lists used to be duplicated verbatim, so a label edit in one drifted
// silently from the other.
const SPECIALTY_KINDS = SpecialtyKind.options;

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
  const t = useTranslations("talents");
  const [data, setData] = useState(initial);

  return (
    <div className="space-y-6">
      <Completeness value={data.completeness} />
      <Tabs defaultValue="identite">
        <TabsList className="flex-wrap">
          <TabsTrigger value="identite">{t("space.profileEditor.tabs.identity")}</TabsTrigger>
          <TabsTrigger value="physique">{t("space.profileEditor.tabs.physical")}</TabsTrigger>
          <TabsTrigger value="medias">{t("space.profileEditor.tabs.media")}</TabsTrigger>
          <TabsTrigger value="specialites">{t("space.profileEditor.tabs.specialties")}</TabsTrigger>
          <TabsTrigger value="preferences">{t("space.profileEditor.tabs.preferences")}</TabsTrigger>
        </TabsList>

        <TabsContent value="identite">
          <IdentityTab data={data} setData={setData} />
        </TabsContent>
        <TabsContent value="physique">
          <PhysicalTab data={data} setData={setData} />
        </TabsContent>
        <TabsContent value="medias">
          {/*
            `initial`, not `data`: media is not part of the draft this editor
            holds. `data` comes from useState(initial), which reads its argument
            only on the first mount, so every later server render — the one
            router.refresh() fetches after an upload or a delete — was thrown
            away and the gallery kept showing its first snapshot. The form
            fields below genuinely are a draft and stay on `data`; media is
            server-owned and mutated by its own actions.
          */}
          <MediaManager media={initial.media} />
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
  const t = useTranslations("talents");
  return (
    <div className="rounded-sedan border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-accent" />{t("space.profileEditor.completeness")}</span>
        <span className="font-display text-lg">{value}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
      {value < 100 && (
        <p className="mt-2 text-xs text-fg-muted">{t("space.profileEditor.completenessHint")}</p>
      )}
    </div>
  );
}

type TabProps = {
  data: ProfileEditorData;
  setData: React.Dispatch<React.SetStateAction<ProfileEditorData>>;
};

function useSave(fn: (input: unknown) => Promise<{ ok: boolean; error?: ActionError; completeness?: number }>) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ActionError | undefined>();
  function save(input: unknown, onDone?: (c?: number) => void) {
    setError(undefined);
    setSaved(false);
    start(async () => {
      const res = await fn(input);
      if (!res.ok) return setError(res.error ?? err("errors.generic"));
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
  error?: ActionError;
  onSave: () => void;
}) {
  const errorText = useActionErrorText();
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
      {error && <span className="text-sm text-danger">{errorText(error)}</span>}
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
  const t = useTranslations("talents");
  const { save, pending, saved, error } = useSave(saveProfileIdentity);
  return (
    <div className="max-w-xl space-y-4">
      <Field label={t("space.profileEditor.stageName")}>
        <Input value={data.stageName} onChange={(e) => setData({ ...data, stageName: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("space.profileEditor.birthDate")}>
          <Input type="date" value={data.birthDate} onChange={(e) => setData({ ...data, birthDate: e.target.value })} />
        </Field>
        <Field label={t("space.profileEditor.city")}>
          <Input value={data.city} onChange={(e) => setData({ ...data, city: e.target.value })} />
        </Field>
      </div>
      <Field label={t("space.profileEditor.phone")}>
        <Input value={data.phone} onChange={(e) => setData({ ...data, phone: e.target.value })} />
      </Field>
      <Field label={t("space.profileEditor.bio")}>
        <textarea
          value={data.bio}
          onChange={(e) => setData({ ...data, bio: e.target.value })}
          rows={4}
          maxLength={600}
          className="w-full rounded-sedan border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          placeholder={t("space.profileEditor.bioPlaceholder")}
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
  const t = useTranslations("talents");
  const { save, pending, saved, error } = useSave(saveProfilePhysical);
  const p = data.physical;
  const setP = (patch: Partial<PhysicalTraits>) =>
    setData({ ...data, physical: { ...p, ...patch } });
  return (
    <div className="max-w-xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("space.profileEditor.height")}>
          <Input type="number" value={p.heightCm ?? ""} onChange={(e) => setP({ heightCm: e.target.value ? Number(e.target.value) : undefined })} />
        </Field>
        <Field label={t("space.profileEditor.build")}>
          <Input value={p.build ?? ""} onChange={(e) => setP({ build: e.target.value })} />
        </Field>
        <Field label={t("space.profileEditor.hair")}>
          <Input value={p.hair ?? ""} onChange={(e) => setP({ hair: e.target.value })} />
        </Field>
        <Field label={t("space.profileEditor.eyes")}>
          <Input value={p.eyes ?? ""} onChange={(e) => setP({ eyes: e.target.value })} />
        </Field>
      </div>
      <Field label={t("space.profileEditor.languages")}>
        <Input value={p.languages.join(", ")} onChange={(e) => setP({ languages: splitList(e.target.value) })} />
      </Field>
      <Field label={t("space.profileEditor.accents")}>
        <Input value={p.accents.join(", ")} onChange={(e) => setP({ accents: splitList(e.target.value) })} />
      </Field>
      <SaveBar pending={pending} saved={saved} error={error} onSave={() => save(p, (c) => c != null && setData((d) => ({ ...d, completeness: c })))} />
    </div>
  );
}

function SpecialtiesTab({ data, setData }: TabProps) {
  const t = useTranslations("talents");
  const ta = useTranslations("app");
  const { save, pending, saved, error } = useSave(saveProfileSpecialties);
  return (
    <div className="max-w-xl space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SPECIALTY_KINDS.map((kind) => {
          const active = data.specialties.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              onClick={() =>
                setData({
                  ...data,
                  specialties: active
                    ? data.specialties.filter((k) => k !== kind)
                    : [...data.specialties, kind],
                })
              }
              className={cn(
                "rounded-sedan border px-3 py-2.5 text-sm transition-colors",
                active ? "border-accent bg-accent-soft text-accent" : "border-border hover:border-accent"
              )}
            >
              {ta(`specialties.${kind}`)}
            </button>
          );
        })}
      </div>
      <Field label={t("space.profileEditor.minRate")}>
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
  const t = useTranslations("talents");
  const { save, pending, saved, error } = useSave(savePreferences);
  const pr = data.preferences;
  const setPr = (patch: Partial<ProfileEditorData["preferences"]>) =>
    setData({ ...data, preferences: { ...pr, ...patch } });
  return (
    <div className="max-w-xl space-y-4">
      {/* The "auto-application" toggle and the daily cap field were removed
          here, not reworded. Both promised behaviour the product does not have:
          dailyCandidatureLimit (src/domain/pricing.ts) has zero readers in all
          of src/, Candidature rows are only ever created by the casting-side
          shortlist flow (actions/brief.ts), and there is no talent-facing apply
          screen at all. Removing the same claim from the pricing page while
          leaving it as a live control inside the paid product would just move
          the problem somewhere harder to see.

          The `autoApply` and `dailyCap` fields stay in the data model, so
          nothing is lost the day the feature actually ships. */}
      <Toggle label={t("space.profileEditor.nudity")} checked={pr.nudity} onChange={(v) => setPr({ nudity: v })} />
      <Toggle label={t("space.profileEditor.animals")} checked={pr.animals} onChange={(v) => setPr({ animals: v })} />
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
