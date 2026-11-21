"use client";

import { useLocale, useTranslations } from "next-intl";
import { SpecialtyKind } from "@/domain/enums";
import { useActionErrorText } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";
import { useId, useState, useTransition } from "react";
import { Check, Loader2, Lock, Sparkles, Trash2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
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
  addAvailability,
  deleteAvailability,
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
}: {
  initial: ProfileEditorData;
  /** Already checked against PROFILE_TABS by the page (?tab= deep links). */
  initialTab?: ProfileTab;
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
              availability={initial.availability}
              onEditLanguages={() => setTab("physique")}
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
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ActionError | undefined>();
  const t = useTranslations("talents");
  const errorText = useActionErrorText();
  function save(input: unknown, onDone?: (c?: number) => void) {
    setError(undefined);
    setSaved(false);
    start(async () => {
      const res = await fn(input);
      if (!res.ok) {
        const e = res.error ?? err("errors.generic");
        toast.error(errorText(e));
        return setError(e);
      }
      setSaved(true);
      toast.success(t("space.profileEditor.saved"));
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
  const t = useTranslations("talents");
  return (
    <div className="flex items-center gap-3 pt-2">
      <Button onClick={onSave} loading={pending}>
        {t("space.profileEditor.save")}
      </Button>
      {saved && (
        <span className="enter flex items-center gap-1 text-sm text-success">
          <Check className="size-4" /> {t("space.profileEditor.saved")}
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
      <Field label={t("space.profileEditor.imdbUrl")}>
        <Input
          type="text"
          inputMode="url"
          value={data.imdbUrl}
          placeholder={t("space.profileEditor.imdbUrlPlaceholder")}
          onChange={(e) => setData({ ...data, imdbUrl: e.target.value })}
        />
      </Field>
      <Field label={t("space.profileEditor.portfolioUrl")}>
        <Input
          type="text"
          inputMode="url"
          value={data.portfolioUrl}
          placeholder={t("space.profileEditor.portfolioUrlPlaceholder")}
          onChange={(e) => setData({ ...data, portfolioUrl: e.target.value })}
        />
      </Field>
      <p className="text-sm">
        <Link href="/talents/app/site" className="font-medium text-accent hover:underline">
          {t("space.profileEditor.noLinks")}
        </Link>
      </p>
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

function PhysicalTab({ data, setData }: TabProps) {
  const t = useTranslations("talents");
  const { save, pending, saved, error } = useSave(saveProfilePhysical);
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
        <HeightField
          label={t("space.profileEditor.height")}
          defaultValue={data.height}
          onChange={setHeight}
        />
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
      <SaveBar
        pending={pending}
        saved={saved}
        error={error}
        onSave={() =>
          save(
            {
              height: data.height,
              hair: p.hair,
              eyes: p.eyes,
              build: p.build,
              languages: p.languages,
              accents: p.accents,
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
  const { save, pending, saved, error } = useSave(saveProfileSpecialties);
  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-fg-muted">{t("space.profileEditor.specialtiesHint")}</p>
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
  availability,
  onEditLanguages,
}: TabProps & { availability: AvailabilityItem[]; onEditLanguages: () => void }) {
  const t = useTranslations("talents");
  const { save, pending, saved, error } = useSave(savePreferences);
  const pr = data.preferences;
  const setPr = (patch: Partial<Preferences>) =>
    setData((d) => ({ ...d, preferences: { ...d.preferences, ...patch } }));
  const p = "space.profileEditor.prefs" as const;
  const languages = data.physical.languages;

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
        saved={saved}
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

      {/* Languages are stored with the physical details; shown here, edited there. */}
      <section className="space-y-2 border-t border-border pt-6">
        <h3 className="text-sm font-medium">{t(`${p}.languages`)}</h3>
        <p className="text-sm text-fg-muted">
          {languages.length > 0 ? languages.join(", ") : t(`${p}.languagesEmpty`)}
        </p>
        <Button variant="link" size="sm" className="px-0" onClick={onEditLanguages}>
          {t(`${p}.languagesEdit`)}
        </Button>
      </section>

      <AvailabilitySection items={availability} />
    </div>
  );
}

function AvailabilitySection({ items }: { items: AvailabilityItem[] }) {
  const t = useTranslations("talents");
  const locale = useLocale();
  // Stored as calendar days (UTC midnight): formatted in UTC so the day shown
  // is the day saved, whatever the viewer's time zone.
  const day = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso));
  const router = useRouter();
  const p = "space.profileEditor.prefs" as const;
  const fromId = useId();
  const toId = useId();
  const typeId = useId();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState<AvailabilityItem["type"]>("AVAILABLE");
  const [pending, start] = useTransition();
  const [error, setError] = useState<ActionError | undefined>();
  const errorText = useActionErrorText();
  const valid = from !== "" && to !== "" && from <= to;

  function run(action: () => Promise<{ ok: boolean; error?: ActionError }>, onDone?: () => void) {
    setError(undefined);
    start(async () => {
      const res = await action();
      if (!res.ok) return setError(res.error ?? err("errors.generic"));
      onDone?.();
      router.refresh();
    });
  }

  return (
    <section className="space-y-3 border-t border-border pt-6">
      <div>
        <h3 className="text-sm font-medium">{t(`${p}.availability`)}</h3>
        <p className="text-sm text-fg-muted">{t(`${p}.availabilityHint`)}</p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-fg-muted">{t(`${p}.availabilityEmpty`)}</p>
      ) : (
        <ul className="divide-y divide-border rounded-sedan border border-border bg-surface">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  a.type === "AVAILABLE" ? "bg-success" : "bg-fg-subtle"
                )}
                aria-hidden="true"
              />
              <span className="flex-1">
                {day(a.from)} → {day(a.to)}
                <span className="ml-2 text-fg-muted">{t(`${p}.availabilityTypes.${a.type}`)}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => run(() => deleteAvailability(a.id))}
              >
                <Trash2 aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">{t(`${p}.availabilityRemove`)}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={fromId}>{t(`${p}.availabilityFrom`)}</Label>
          <Input id={fromId} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={toId}>{t(`${p}.availabilityTo`)}</Label>
          <Input id={toId} type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={typeId}>{t(`${p}.availabilityType`)}</Label>
          <Select value={type} onValueChange={(v) => setType(v === "UNAVAILABLE" ? "UNAVAILABLE" : "AVAILABLE")}>
            <SelectTrigger id={typeId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent data-portal="talents">
              <SelectItem value="AVAILABLE">{t(`${p}.availabilityTypes.AVAILABLE`)}</SelectItem>
              <SelectItem value="UNAVAILABLE">{t(`${p}.availabilityTypes.UNAVAILABLE`)}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="secondary"
          disabled={!valid || pending}
          onClick={() =>
            run(
              () => addAvailability({ from, to, type }),
              () => {
                setFrom("");
                setTo("");
              }
            )
          }
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t(`${p}.availabilityAdd`)}
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{errorText(error)}</p>}
    </section>
  );
}

/**
 * Optional and private: shown to the performer only, saved by its own
 * action, and never part of the job preferences above.
 */
function ContentBoundariesSection({ data, setData }: TabProps) {
  const t = useTranslations("talents");
  const { save, pending, saved, error } = useSave(saveContentBoundaries);
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
        saved={saved}
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
