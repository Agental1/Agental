"use client";

import { useLocale, useTranslations } from "next-intl";
import { SpecialtyKind } from "@/domain/enums";
import { useActionErrorText } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";
import { useEffect, useId, useState, useTransition } from "react";
import { Check, Lock, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input, Label } from "@/components/ui/input";
import { MediaManager, type MediaItem } from "./media-manager";
import { HeightField } from "./height-field";
import { cn } from "@/lib/utils";
import type { PhysicalTraits } from "@/domain/json";
import type { HeightValue } from "@/domain/height";
import { DEFAULT_PROFILE_TAB, type ProfileTab } from "@/domain/profile-tabs";
import { BIO_MAX } from "@/domain/profile";
import { EYE_COLORS, GENDERS, HAIR_COLORS, HAIR_LENGTHS, matchOption, optionKey } from "@/domain/identity";
import {
  COMPENSATION,
  PROJECT_TYPES,
  ROLE_TYPES,
  TRAVEL,
  WORK_MODES,
  type ContentBoundaries,
  type Preferences,
} from "@/domain/preferences";
import {
  saveContentBoundaries,
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
  legalFirstName: string;
  legalLastName: string;
  gender: string;
  genderOther: string;
  phone: string;
  city: string;
  bio: string;
  imdbUrl: string;
  portfolioUrl: string;
  birthDate: string;
  physical: PhysicalTraits;
  specialties: string[];
  minRateEuros?: number;
  completeness: number;
  media: MediaItem[];
  /** Job preferences, as readPreferences returns them: unset stays unset. */
  preferences: Preferences;
  /** Private to the performer. Saved apart from the preferences. */
  contentBoundaries: ContentBoundaries;
  /** Server-owned, like media: changed by its own actions, then refreshed. */
  availability: AvailabilityItem[];
}

export interface AvailabilityItem {
  id: string;
  /** yyyy-mm-dd */
  from: string;
  to: string;
  type: "AVAILABLE" | "UNAVAILABLE";
}

function splitList(v: string) {
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

/** The editor's draft: the server data plus the height as last entered. */
type Draft = ProfileEditorData & { height?: HeightValue };

export function ProfileEditor({
  initial,
  initialTab = DEFAULT_PROFILE_TAB,
  initialFocus,
}: {
  initial: ProfileEditorData;
  /** Already checked against PROFILE_TABS by the page (?tab= deep links). */
  initialTab?: ProfileTab;
  /** Already checked against PROFILE_FOCUS_FIELDS: the field to focus on arrival. */
  initialFocus?: string;
}) {
  const t = useTranslations("talents");
  // Untouched, the stored height goes back as exact centimeters.
  const [data, setData] = useState<Draft>(() => ({
    ...initial,
    height:
      initial.physical.heightCm != null
        ? { unit: "metric", cm: initial.physical.heightCm }
        : undefined,
  }));

  // Controlled, so Preferences can send the performer to the Physical tab,
  // where languages are edited.
  const [tab, setTab] = useState<string>(initialTab);

  // A deep link (?tab=identite&focus=birthDate) lands on the field to fill.
  useEffect(() => {
    if (!initialFocus) return;
    const el = document.querySelector<HTMLElement>(`[data-field="${initialFocus}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.querySelector<HTMLElement>("input, textarea, select, button")?.focus({ preventScroll: true });
  }, [initialFocus]);

  return (
    <div className="space-y-6">
      <Completeness value={data.completeness} />
      <Tabs value={tab} onValueChange={setTab}>
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
          <div className="space-y-8">
            <PreferencesTab
              data={data}
              setData={setData}
            />
            <ContentBoundariesSection data={data} setData={setData} />
          </div>
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
  data: Draft;
  setData: React.Dispatch<React.SetStateAction<Draft>>;
};

function useSave(fn: (input: unknown) => Promise<{ ok: boolean; error?: ActionError; completeness?: number }>) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<ActionError | undefined>();
  const t = useTranslations("talents");
  function save(input: unknown, onDone?: (c?: number) => void) {
    setError(undefined);
    start(async () => {
      const res = await fn(input);
      if (!res.ok) {
        // Errors stay inline next to the form until fixed; success is a toast.
        return setError(res.error ?? err("errors.generic"));
      }
      toast.success(t("space.profileEditor.saved"));
      onDone?.(res.completeness);
    });
  }
  return { save, pending, error };
}

function SaveBar({
  pending,
  error,
  onSave,
}: {
  pending: boolean;
  error?: ActionError;
  onSave: () => void;
}) {
  const errorText = useActionErrorText();
  const t = useTranslations("talents");
  return (
    <div className="flex items-center gap-3 pt-2">
      <Button onClick={onSave} loading={pending}>
        {t("space.profileEditor.save")}
      </Button>
      {error && <span className="text-sm text-danger">{errorText(error)}</span>}
    </div>
  );
}

function Field({
  label,
  field,
  hint,
  children,
}: {
  label: string;
  field?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5" data-field={field}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

function IdentityTab({ data, setData }: TabProps) {
  const t = useTranslations("talents");
  const locale = useLocale();
  const { save, pending, error } = useSave(saveProfileIdentity);
  const e = "space.profileEditor" as const;
  const nf = new Intl.NumberFormat(locale);
  const p = data.physical;
  const setP = (patch: Partial<PhysicalTraits>) =>
    setData({ ...data, physical: { ...p, ...patch } });
  return (
    <div className="max-w-xl space-y-4">
      <fieldset className="space-y-1.5" data-field="legalName">
        <legend className="text-sm font-medium">{t(`${e}.legalName`)}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            aria-label={t(`${e}.legalFirstName`)}
            placeholder={t(`${e}.legalFirstName`)}
            autoComplete="given-name"
            value={data.legalFirstName}
            onChange={(ev) => setData({ ...data, legalFirstName: ev.target.value })}
          />
          <Input
            aria-label={t(`${e}.legalLastName`)}
            placeholder={t(`${e}.legalLastName`)}
            autoComplete="family-name"
            value={data.legalLastName}
            onChange={(ev) => setData({ ...data, legalLastName: ev.target.value })}
          />
        </div>
        <p className="text-xs text-fg-muted">{t(`${e}.legalNameHint`)}</p>
      </fieldset>
      <Field label={t(`${e}.stageName`)} field="stageName" hint={t(`${e}.stageNameHint`)}>
        <Input value={data.stageName} onChange={(ev) => setData({ ...data, stageName: ev.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t(`${e}.birthDate`)} field="birthDate">
          <Input type="date" value={data.birthDate} onChange={(ev) => setData({ ...data, birthDate: ev.target.value })} />
        </Field>
        <Field label={t(`${e}.city`)} field="city">
          <Input value={data.city} onChange={(ev) => setData({ ...data, city: ev.target.value })} />
        </Field>
      </div>
      <Field label={t(`${e}.gender`)} field="gender" hint={t(`${e}.genderHint`)}>
        <Select
          value={data.gender || undefined}
          onValueChange={(gender) => setData({ ...data, gender })}
        >
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
            onChange={(ev) => setData({ ...data, genderOther: ev.target.value })}
          />
        )}
      </Field>
      <Field label={t(`${e}.phone`)} field="phone">
        <Input value={data.phone} onChange={(ev) => setData({ ...data, phone: ev.target.value })} />
      </Field>
      <Field label={t(`${e}.languages`)} field="languages">
        <Input value={p.languages.join(", ")} onChange={(ev) => setP({ languages: splitList(ev.target.value) })} />
      </Field>
      <Field label={t(`${e}.accents`)} field="accents">
        <Input value={p.accents.join(", ")} onChange={(ev) => setP({ accents: splitList(ev.target.value) })} />
      </Field>
      <Field label={t(`${e}.bio`)} field="bio">
        <textarea
          value={data.bio}
          onChange={(ev) => setData({ ...data, bio: ev.target.value })}
          rows={6}
          maxLength={BIO_MAX}
          aria-describedby="bio-count"
          className="w-full rounded-sedan border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          placeholder={t(`${e}.bioPlaceholder`)}
        />
        <p id="bio-count" className="text-right text-xs tabular-nums text-fg-muted" aria-live="polite">
          {nf.format(data.bio.length)} / {nf.format(BIO_MAX)}
        </p>
      </Field>
      <Field label={t(`${e}.imdbUrl`)} field="imdbUrl">
        <Input
          type="text"
          inputMode="url"
          value={data.imdbUrl}
          placeholder={t(`${e}.imdbUrlPlaceholder`)}
          onChange={(ev) => setData({ ...data, imdbUrl: ev.target.value })}
        />
      </Field>
      <Field label={t(`${e}.portfolioUrl`)}>
        <Input
          type="text"
          inputMode="url"
          value={data.portfolioUrl}
          placeholder={t(`${e}.portfolioUrlPlaceholder`)}
          onChange={(ev) => setData({ ...data, portfolioUrl: ev.target.value })}
        />
      </Field>
      <p className="text-sm">
        <Link href="/talents/app/abonnement#limelight" className="font-medium text-accent hover:underline">
          {t(`${e}.noLinks`)}
        </Link>
      </p>
      <SaveBar
        pending={pending}
        error={error}
        onSave={() =>
          save(
            {
              stageName: data.stageName,
              legalFirstName: data.legalFirstName,
              legalLastName: data.legalLastName,
              gender: data.gender || undefined,
              genderOther: data.genderOther,
              phone: data.phone,
              city: data.city,
              bio: data.bio,
              languages: p.languages,
              accents: p.accents,
              imdbUrl: data.imdbUrl,
              portfolioUrl: data.portfolioUrl,
              birthDate: data.birthDate || undefined,
            },
            (c) => c != null && setData((d) => ({ ...d, completeness: c }))
          )
        }
      />
    </div>
  );
}

/**
 * A fixed list of options. A stored value that matches no option (free text
 * from before round 8) stays selected and shows as "Other: <value>".
 */
function OptionSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  const t = useTranslations("talents");
  const e = "space.profileEditor" as const;
  const raw = (value ?? "").trim();
  const known = matchOption(options, raw);
  const legacy = raw && !known ? raw : null;
  return (
    <Select value={known ?? (legacy ? `legacy:${legacy}` : undefined)} onValueChange={(v) => onChange(v.startsWith("legacy:") ? v.slice(7) : v)}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue placeholder={t(`${e}.choose`)} />
      </SelectTrigger>
      <SelectContent data-portal="talents">
        {options.map((o) => (
          <SelectItem key={o} value={o}>{t(`${e}.options.${optionKey(o)}` as "space.profileEditor.options.other")}</SelectItem>
        ))}
        {legacy && (
          <SelectItem value={`legacy:${legacy}`}>{t(`${e}.otherValue`, { value: legacy })}</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

function PhysicalTab({ data, setData }: TabProps) {
  const t = useTranslations("talents");
  const { save, pending, error } = useSave(saveProfilePhysical);
  const p = data.physical;
  const setP = (patch: Partial<PhysicalTraits>) =>
    setData({ ...data, physical: { ...p, ...patch } });
  const setHeight = (height: HeightValue | undefined) =>
    setData((d) => ({ ...d, height }));
  return (
    <div className="max-w-xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Tabs unmount when hidden. The field reopens on the draft, the
            value Save sends, an entry the server would refuse included. */}
        <div data-field="height">
          <HeightField
            label={t("space.profileEditor.height")}
            defaultValue={data.height}
            onChange={setHeight}
          />
        </div>
        <Field label={t("space.profileEditor.build")}>
          <Input value={p.build ?? ""} onChange={(e) => setP({ build: e.target.value })} />
        </Field>
        <Field label={t("space.profileEditor.hair")} field="hair">
          <OptionSelect label={t("space.profileEditor.hair")} options={HAIR_COLORS} value={p.hair} onChange={(hair) => setP({ hair })} />
        </Field>
        <Field label={t("space.profileEditor.hairLength")} field="hairLength">
          <OptionSelect label={t("space.profileEditor.hairLength")} options={HAIR_LENGTHS} value={p.hairLength} onChange={(hairLength) => setP({ hairLength })} />
        </Field>
        <Field label={t("space.profileEditor.eyes")} field="eyes">
          <OptionSelect label={t("space.profileEditor.eyes")} options={EYE_COLORS} value={p.eyes} onChange={(eyes) => setP({ eyes })} />
        </Field>
      </div>
      <SaveBar
        pending={pending}
        error={error}
        onSave={() =>
          save(
            {
              height: data.height ?? null,
              hair: p.hair,
              hairLength: p.hairLength,
              eyes: p.eyes,
              build: p.build,
            },
            (c) => c != null && setData((d) => ({ ...d, completeness: c }))
          )
        }
      />
    </div>
  );
}

function SpecialtiesTab({ data, setData }: TabProps) {
  const t = useTranslations("talents");
  const ta = useTranslations("app");
  const { save, pending, error } = useSave(saveProfileSpecialties);
  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-fg-muted">{t("space.profileEditor.specialtiesHint")}</p>
      <div data-field="specialties" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
        error={error}
        onSave={() =>
          save(
            {
              specialties: data.specialties.map((kind) => ({ kind, level: "BEGINNER" })),
              minRateEuros: data.minRateEuros,
            },
            (c) => c != null && setData((d) => ({ ...d, completeness: c }))
          )
        }
      />
    </div>
  );
}

function PreferencesTab({
  data,
  setData,
}: TabProps) {
  const t = useTranslations("talents");
  const { save, pending, error } = useSave(savePreferences);
  const pr = data.preferences;
  const setPr = (patch: Partial<Preferences>) =>
    setData((d) => ({ ...d, preferences: { ...d.preferences, ...patch } }));
  const p = "space.profileEditor.prefs" as const;

  return (
    <div className="max-w-2xl space-y-6">
      {/* The auto-application toggle and the daily cap stay out: the product
          has no talent-side apply flow for them to drive. Nudity moved to
          Content boundaries, below, which only the performer sees. */}
      <p className="text-sm text-fg-muted">{t(`${p}.optionalHint`)}</p>

      <ChipGroup
        legend={t(`${p}.projectTypes`)}
        options={PROJECT_TYPES.map((v) => ({ value: v, label: t(`${p}.projectTypeLabels.${v}`) }))}
        selected={pr.projectTypes}
        onChange={(projectTypes) => setPr({ projectTypes })}
      />
      <ChipGroup
        legend={t(`${p}.roleTypes`)}
        options={ROLE_TYPES.map((v) => ({ value: v, label: t(`${p}.roleTypeLabels.${v}`) }))}
        selected={pr.roleTypes}
        onChange={(roleTypes) => setPr({ roleTypes })}
      />
      <ChipGroup
        single
        legend={t(`${p}.compensation`)}
        hint={t(`${p}.clearHint`)}
        options={COMPENSATION.map((v) => ({ value: v, label: t(`${p}.compensationLabels.${v}`) }))}
        selected={pr.compensation ? [pr.compensation] : []}
        onChange={(v) => setPr({ compensation: v[0] ?? null })}
      />
      <ChipGroup
        single
        legend={t(`${p}.travel`)}
        hint={t(`${p}.clearHint`)}
        options={TRAVEL.map((v) => ({ value: v, label: t(`${p}.travelLabels.${v}`) }))}
        selected={pr.travel ? [pr.travel] : []}
        onChange={(v) => setPr({ travel: v[0] ?? null })}
      />
      <ChipGroup
        legend={t(`${p}.workModes`)}
        options={WORK_MODES.map((v) => ({ value: v, label: t(`${p}.workModeLabels.${v}`) }))}
        selected={pr.workModes}
        onChange={(workModes) => setPr({ workModes })}
      />
      <TriState
        legend={t(`${p}.animals`)}
        value={pr.animals}
        onChange={(animals) => setPr({ animals })}
      />

      <SaveBar
        pending={pending}
        error={error}
        onSave={() =>
          save({
            projectTypes: pr.projectTypes,
            roleTypes: pr.roleTypes,
            compensation: pr.compensation,
            travel: pr.travel,
            workModes: pr.workModes,
            animals: pr.animals,
          })
        }
      />

      {/* Round 8: languages are edited in Identity only, and Availability is
          hidden (its rows stay in the database). */}
    </div>
  );
}

/**
 * Optional and private: shown to the performer only, saved by its own
 * action, and never part of the job preferences above.
 */
function ContentBoundariesSection({ data, setData }: TabProps) {
  const t = useTranslations("talents");
  const { save, pending, error } = useSave(saveContentBoundaries);
  const b = "space.profileEditor.boundaries" as const;
  return (
    <section
      aria-labelledby="content-boundaries"
      className="max-w-2xl space-y-4 rounded-sedan border border-border bg-surface-2/50 p-5"
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Lock aria-hidden="true" className="size-4 text-fg-muted" />
          <h3 id="content-boundaries" className="font-display text-lg font-medium">
            {t(`${b}.title`)}
          </h3>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-fg-muted">
            {t(`${b}.optional`)}
          </span>
        </div>
        <p className="mt-1 text-sm text-fg-muted">{t(`${b}.private`)}</p>
      </div>
      <TriState
        legend={t(`${b}.nudity`)}
        value={data.contentBoundaries.nudity}
        onChange={(nudity) => setData((d) => ({ ...d, contentBoundaries: { nudity } }))}
      />
      <SaveBar
        pending={pending}
        error={error}
        onSave={() => save({ nudity: data.contentBoundaries.nudity })}
      />
    </section>
  );
}

/**
 * A group of chips. Multi-select by default; with `single`, one choice at a
 * time, and pressing the chosen one again clears it.
 */
function ChipGroup<T extends string>({
  legend,
  hint,
  options,
  selected,
  onChange,
  single = false,
}: {
  legend: string;
  hint?: string;
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
  single?: boolean;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      {hint && <p className="text-xs text-fg-muted">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() =>
                onChange(
                  active
                    ? selected.filter((v) => v !== o.value)
                    : single
                      ? [o.value]
                      : [...selected, o.value]
                )
              }
              className={cn(
                "min-h-9 rounded-full border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border hover:border-accent"
              )}
            >
              {active && <Check aria-hidden="true" className="-ml-0.5 mr-1 inline size-3.5" />}
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Not set, yes or no, as three radio buttons. Not set is a real answer: none. */
function TriState({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  const t = useTranslations("talents");
  const name = useId();
  const choices: { key: string; v: boolean | null; label: string }[] = [
    { key: "unset", v: null, label: t("space.profileEditor.prefs.notSet") },
    { key: "yes", v: true, label: t("space.profileEditor.prefs.yes") },
    { key: "no", v: false, label: t("space.profileEditor.prefs.no") },
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="inline-flex flex-wrap gap-1 rounded-sedan bg-surface-2 p-1">
        {choices.map((c) => (
          <label
            key={c.key}
            className="cursor-pointer rounded-[calc(var(--sedan)-0.25rem)] px-3 py-1.5 text-sm text-fg-muted transition-colors has-[:checked]:bg-surface has-[:checked]:font-medium has-[:checked]:text-fg has-[:checked]:shadow-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={value === c.v}
              onChange={() => onChange(c.v)}
            />
            {c.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
