"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionErrorText } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Eye,
  Footprints,
  Gem,
  ImagePlus,
  Loader2,
  Lock,
  Palette,
  PartyPopper,
  PenTool,
  PersonStanding,
  Ruler,
  Scissors,
  Shirt,
  Sparkles,
  Weight,
  X,
  type LucideIcon,
} from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input, Label } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MediaManager, type MediaItem } from "./media-manager";
import { HeightField } from "./height-field";
import { cn } from "@/lib/utils";
import { SpecialtyKind } from "@/domain/enums";
import type { PhysicalTraits } from "@/domain/json";
import type { HeightValue } from "@/domain/height";
import { DEFAULT_PROFILE_TAB, ITEM_TARGET, PROFILE_TABS, type ProfileTab } from "@/domain/profile-tabs";
import { BIO_MAX } from "@/domain/profile";
import {
  BUILDS,
  EYE_COLORS,
  GENDERS,
  HAIR_COLORS,
  HAIR_LENGTHS,
  joinMulti,
  matchOption,
  optionKey,
  splitMulti,
} from "@/domain/identity";
import { heightInBothUnits, heightToCm } from "@/domain/height";
import { kgToLb, weightInBothUnits, weightTextToKg, type WeightUnit } from "@/domain/weight";
import type { MissingItem } from "@/domain/completeness";
import {
  AGE_MAX,
  AGE_MIN,
  COMPENSATION,
  PROJECT_TYPES,
  ROLE_TYPES,
  TRAVEL,
  WORK_MODES,
  isSkillSpecialty,
  MATURITY_RATINGS,
  type ContentBoundaries,
  type Preferences,
} from "@/domain/preferences";
import {
  saveContentBoundaries,
  saveDayRate,
  saveProfileIdentity,
  saveProfilePhysical,
  savePreferences,
  saveSkills,
  type SaveResult,
} from "@/app/actions/profile";
import { avatarAsHeadshot } from "@/app/actions/media";
import { ChipMultiSelect, LocationField, PhoneField } from "./smart-inputs";
import { LANGUAGE_ORDER, languageMatches } from "@/domain/languages";
import { ACCENT_GROUPS, NO_ACCENTS, accentMatches } from "@/domain/accents";
import { requestEmailVerification } from "@/app/actions/account-email";
import { RoleAlertForm, type RoleAlertChannel } from "./role-alert-form";
import { StepNumber } from "./step-number";
import { MISSING_BOX, MissingFieldsContext, RequiredNote, useMissingField } from "./missing-fields";

const SKILLS = SpecialtyKind.options.filter(isSkillSpecialty);

export interface ProfileEditorData {
  stageName: string;
  legalFirstName: string;
  legalLastName: string;
  gender: string;
  genderOther: string;
  phone: string;
  /** Round 8: E.164, set once the number is valid. */
  phoneE164: string;
  city: string;
  countryCode: string | null;
  admin1Code: string | null;
  cityGeonameId: number | null;
  bio: string;
  imdbUrl: string;
  portfolioUrl: string;
  birthDate: string;
  physical: PhysicalTraits;
  /** Specialty kinds as stored; the editor shows the skill ones. */
  specialties: string[];
  /** Whole US dollars a day; kept when paid work is unselected. */
  dayRateUsd?: number;
  completeness: number;
  /** Required items still missing, in tab order (src/domain/completeness.ts). */
  missing: MissingItem[];
  media: MediaItem[];
  /** Job preferences, already merged with the old specialties. */
  preferences: Preferences;
  /** Private to the performer. Saved apart from the preferences. */
  contentBoundaries: ContentBoundaries;
}

/** The editor's draft: the server data plus the height as last entered. */
type Draft = ProfileEditorData & { height?: HeightValue };

type Status = "idle" | "saving" | "saved" | "error";

const LANGUAGE_NAMES = LANGUAGE_ORDER.map((l) => l.name);
const LANGUAGE_BY_NAME = new Map(LANGUAGE_ORDER.map((l) => [l.name, l]));
const matchLanguage = (name: string, q: string) => {
  const l = LANGUAGE_BY_NAME.get(name);
  return l ? languageMatches(l, q) : name.toLowerCase().startsWith(q.trim().toLowerCase());
};
const ACCENT_OPTIONS = ACCENT_GROUPS.map((g) => ({ heading: g.region, options: g.accents }));

/**
 * Autosave (round 8). Each group of fields (identity, physical, preferences,
 * skills, day rate, boundaries) saves about 800 ms after the last change, and
 * at once on blur and on a tab change. The last payload of a group wins.
 */
function useAutosave(onResult: (res: SaveResult) => void) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<ActionError | undefined>();
  const pending = useRef(new Map<string, () => Promise<SaveResult>>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const failed = useRef(new Map<string, () => Promise<SaveResult>>());
  const inflight = useRef(0);

  const run = useCallback(
    async (key: string) => {
      const job = pending.current.get(key);
      if (!job) return;
      pending.current.delete(key);
      const t = timers.current.get(key);
      if (t) clearTimeout(t);
      timers.current.delete(key);
      inflight.current += 1;
      setStatus("saving");
      let res: SaveResult;
      try {
        res = await job();
      } catch {
        res = { ok: false, error: err("errors.generic") };
      }
      inflight.current -= 1;
      if (!res.ok) {
        failed.current.set(key, job);
        setError(res.error ?? err("errors.generic"));
        setStatus("error");
        return;
      }
      failed.current.delete(key);
      onResult(res);
      if (inflight.current === 0 && failed.current.size === 0) {
        setError(undefined);
        setStatus(pending.current.size > 0 ? "saving" : "saved");
      }
    },
    [onResult]
  );

  const queue = useCallback(
    (key: string, job: () => Promise<SaveResult>, delay = 800) => {
      pending.current.set(key, job);
      const t = timers.current.get(key);
      if (t) clearTimeout(t);
      timers.current.set(key, setTimeout(() => void run(key), delay));
      setStatus("saving");
    },
    [run]
  );

  const flush = useCallback(() => {
    for (const key of [...pending.current.keys()]) void run(key);
  }, [run]);

  const retry = useCallback(() => {
    for (const [key, job] of failed.current) {
      pending.current.set(key, job);
      void run(key);
    }
  }, [run]);

  useEffect(() => {
    const timersNow = timers.current;
    return () => {
      for (const t of timersNow.values()) clearTimeout(t);
    };
  }, []);

  return { status, error, queue, flush, retry };
}

export function ProfileEditor({
  initial,
  initialTab = DEFAULT_PROFILE_TAB,
  initialFocus,
  emailVerified,
  hasAvatar,
  celebrated,
  roleAlert,
}: {
  /** Round 8: how we tell them about a role found (also in Settings). */
  roleAlert: { initial: RoleAlertChannel; hasPhone: boolean; consentGiven: boolean };
  initial: ProfileEditorData;
  /** Already checked against PROFILE_TABS by the page (?tab= deep links). */
  initialTab?: ProfileTab;
  /** Already checked against PROFILE_FOCUS_FIELDS: the field to focus on arrival. */
  initialFocus?: string;
  emailVerified: boolean;
  /** A profile picture exists: offer it as the first headshot. */
  hasAvatar: boolean;
  /** The 100% celebration already happened (profileCompletedAt). */
  celebrated: boolean;
}) {
  const t = useTranslations("talents");
  const router = useRouter();
  // Untouched, the stored height goes back as exact centimeters.
  const [data, setData] = useState<Draft>(() => ({
    ...initial,
    height:
      initial.physical.heightCm != null
        ? { unit: "metric", cm: initial.physical.heightCm }
        : undefined,
  }));
  const [tab, setTab] = useState<string>(initialTab);
  const [celebrate, setCelebrate] = useState(false);
  const [done, setDone] = useState(celebrated && initial.completeness === 100);

  const onResult = useCallback((res: SaveResult) => {
    if (res.completeness == null) return;
    setData((d) => ({ ...d, completeness: res.completeness! }));
    if (res.justCompleted) {
      setCelebrate(true);
      setDone(true);
      void burst();
    } else if (res.completeness < 100) {
      setDone(false);
    } else {
      setDone(true);
    }
  }, []);
  const save = useAutosave(onResult);

  // The missing list comes from the server; refresh it after saves settle.
  useEffect(() => {
    if (save.status === "saved") router.refresh();
  }, [save.status, router]);
  const missing = initial.missing;

  // A deep link (?tab=identite&focus=birthDate) lands on the field to fill.
  useEffect(() => {
    if (initialFocus) focusField(initialFocus);
  }, [initialFocus]);

  function goTab(next: string) {
    save.flush();
    setTab(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goToItem(item: MissingItem) {
    const target = ITEM_TARGET[item];
    setTab(target.tab);
    focusField(target.focus);
  }

  // Round 10: each click on Finish below 100% goes to the next missing field.
  const finishStep = useRef(0);
  function finish() {
    save.flush();
    if (data.completeness >= 100 || missing.length === 0) {
      toast.success(t("space.profileEditor.finishDone"));
      router.push("/talents/app");
      return;
    }
    const item = missing[finishStep.current % missing.length];
    finishStep.current += 1;
    toast.message(t("space.profileEditor.finishMissing"), {
      description: t(`space.dashboard.action.${item}`),
    });
    goToItem(item);
  }

  const missingFields = new Set(missing.map((i) => ITEM_TARGET[i].focus));
  const missingPerTab = (tabId: ProfileTab) => missing.filter((i) => ITEM_TARGET[i].tab === tabId).length;
  const tabLabel = (tabId: ProfileTab, label: string) => {
    const n = missingPerTab(tabId);
    if (n === 0) return label;
    return (
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="size-2 rounded-full bg-danger" />
        {label}
        <span className="text-danger">· {n}</span>
        <span className="sr-only">{t("space.profileEditor.tabMissing", { count: n })}</span>
      </span>
    );
  };

  const index = PROFILE_TABS.indexOf(tab as ProfileTab);
  const nav = (
    <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
      {index > 0 ? (
        <Button variant="outline" onClick={() => goTab(PROFILE_TABS[index - 1])}>
          <ArrowLeft /> {t("space.profileEditor.back")}
        </Button>
      ) : (
        <span />
      )}
      {index < PROFILE_TABS.length - 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          {/* Round 10: below 100%, Finish is on every tab and walks the missing fields. */}
          {data.completeness < 100 && missing.length > 0 && (
            <Button variant="outline" onClick={finish}>
              <Check /> {t("space.profileEditor.finish")}
            </Button>
          )}
          <Button onClick={() => goTab(PROFILE_TABS[index + 1])}>
            {t("space.profileEditor.next")} <ArrowRight />
          </Button>
        </div>
      ) : (
        <Button onClick={finish}>
          <Check /> {t("space.profileEditor.finish")}
        </Button>
      )}
    </div>
  );

  const tabProps = { data, setData, queue: save.queue, flush: save.flush };
  // Why the tab matters: one short line per required tab (round 12).
  const why = (tabId: "identity" | "physical" | "media" | "preferences") => (
    <p className="mb-4 text-sm text-fg-muted">{t(`space.profileEditor.why.${tabId}`)}</p>
  );
  const hasSelfPhoto = initial.media.some(
    (m) => m.type === "PHOTO" && (m.category ?? "SELF") === "SELF"
  );

  return (
    <MissingFieldsContext.Provider value={missingFields}>
    <div className="space-y-6">
      <Completeness
        value={data.completeness}
        done={done}
        celebrate={celebrate}
        emailVerified={emailVerified}
        missing={data.completeness < 100 ? missing : []}
        onGo={goToItem}
      />
      <p className="text-sm text-fg-muted">
        <span className="text-danger" aria-hidden="true">* </span>
        {t("space.profileEditor.requiredNote")}
      </p>
      <Tabs value={tab} onValueChange={goTab}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="flex-wrap">
            <TabsTrigger value="identite">{tabLabel("identite", t("space.profileEditor.tabs.identity"))}</TabsTrigger>
            <TabsTrigger value="physique">{tabLabel("physique", t("space.profileEditor.tabs.physical"))}</TabsTrigger>
            <TabsTrigger value="medias">{tabLabel("medias", t("space.profileEditor.tabs.media"))}</TabsTrigger>
            <TabsTrigger value="preferences">{tabLabel("preferences", t("space.profileEditor.tabs.preferences"))}</TabsTrigger>
          </TabsList>
          <SaveStatus status={save.status} error={save.error} onRetry={save.retry} />
        </div>

        <TabsContent value="identite">
          {why("identity")}
          <IdentityTab {...tabProps} />
          {nav}
        </TabsContent>
        <TabsContent value="physique">
          {why("physical")}
          <PhysicalTab {...tabProps} />
          {nav}
        </TabsContent>
        <TabsContent value="medias">
          {why("media")}
          {hasAvatar && !hasSelfPhoto && <AvatarHeadshot />}
          {/* `initial`: media is server-owned, refreshed after each change. */}
          <MediaManager media={initial.media} />
          {nav}
        </TabsContent>
        <TabsContent value="preferences">
          {why("preferences")}
          <PreferencesTab
            {...tabProps}
            aside={
              <>
                <section className="border-t border-border pt-6">
                  <RoleAlertForm {...roleAlert} number={9} />
                </section>
                <ContentBoundariesSection {...tabProps} number={10} />
              </>
            }
          />
          {nav}
        </TabsContent>
      </Tabs>
    </div>
    </MissingFieldsContext.Provider>
  );
}

/**
 * Scroll to a field and put the cursor in it, once its tab has rendered. Timers,
 * not requestAnimationFrame: a tab opened in the background pauses animation
 * frames, and the cursor would never land (round 8c). It tries for two seconds,
 * so a slow phone that renders the tab late still gets the cursor.
 */
function focusField(focus: string, tries = 20) {
  window.setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`[data-field="${focus}"]`);
    if (!el || el.offsetParent === null) {
      if (tries > 1) focusField(focus, tries - 1);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    // A field may name the control to open (the City picker after Country).
    const target =
      el.querySelector<HTMLElement>("[data-focus-target]") ??
      el.querySelector<HTMLElement>("input, textarea, button, [role=combobox], [role=slider]");
    target?.focus({ preventScroll: true });
  }, tries === 20 ? 50 : 100);
}

/** Confetti, once, unless the system asks for reduced motion. */
async function burst() {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const { default: confetti } = await import("canvas-confetti");
  void confetti({
    particleCount: 90,
    spread: 70,
    origin: { y: 0.3 },
    colors: ["#246BFE", "#DCEAFF", "#102B63", "#FFFFFF"],
    disableForReducedMotion: true,
  });
}

function SaveStatus({ status, error, onRetry }: { status: Status; error?: ActionError; onRetry: () => void }) {
  const t = useTranslations("talents.space.profileEditor");
  const errorText = useActionErrorText();
  const network = !error || error.key === "errors.generic";
  return (
    <div aria-live="polite" className="flex min-h-9 items-center gap-2 text-sm">
      {status === "saving" && (
        <span className="flex items-center gap-1.5 text-fg-muted">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" /> {t("saving")}
        </span>
      )}
      {status === "saved" && (
        <span className="flex items-center gap-1.5 text-success">
          <Check aria-hidden="true" className="size-4" /> {t("saved")}
        </span>
      )}
      {status === "error" && (
        <span className="flex flex-wrap items-center gap-2 text-danger">
          <CircleAlert aria-hidden="true" className="size-4" />
          {network ? t("notSaved") : errorText(error)}
          {network && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              {t("retry")}
            </Button>
          )}
        </span>
      )}
    </div>
  );
}

function Completeness({
  value,
  done,
  celebrate,
  emailVerified,
  missing,
  onGo,
}: {
  value: number;
  done: boolean;
  celebrate: boolean;
  emailVerified: boolean;
  /** Round 10: the missing required fields, each a link to the field. */
  missing: MissingItem[];
  onGo: (item: MissingItem) => void;
}) {
  const t = useTranslations("talents");
  const [cooldown, setCooldown] = useState(false);
  const [pending, start] = useTransition();
  // The card shows below 100%, and folds away once 100% is reached. It comes
  // back if a required field is emptied later.
  const hidden = value >= 100 && done;
  return (
    <div className="space-y-3">
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-500 ease-out motion-reduce:transition-none",
          hidden ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        )}
        aria-hidden={hidden || undefined}
      >
        <div className="overflow-hidden">
          <div className="rounded-sedan border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="size-4 text-accent" />
                {t("space.profileEditor.completeness")}
              </span>
              <span className="font-display text-lg">{value}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${value}%` }} />
            </div>
            {value < 100 && (
              <p className="mt-2 text-xs text-fg-muted">{t("space.profileEditor.completenessHint")}</p>
            )}
            {missing.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-bold text-danger">
                  {t("space.profileEditor.missingTitle", { count: missing.length })}
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {missing.map((item) => (
                    <li key={item}>
                      <button
                        type="button"
                        onClick={() => onGo(item)}
                        className="inline-flex items-center gap-1 rounded-full border border-danger/50 px-2.5 py-0.5 text-xs font-medium text-danger hover:bg-danger/10"
                      >
                        {t(`space.profileEditor.missingField.${item}`)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
      {celebrate && (
        <div role="status" className="flex items-start gap-3 rounded-sedan border border-accent/40 bg-accent-soft/40 p-4">
          <PartyPopper aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
          <div className="space-y-1 text-sm">
            <p className="font-bold">{t("space.profileEditor.completeTitle")}</p>
            {!emailVerified && (
              <p className="text-fg-muted">
                {t("space.profileEditor.verifyToSearch")}{" "}
                <button
                  type="button"
                  disabled={pending || cooldown}
                  onClick={() =>
                    start(async () => {
                      const res = await requestEmailVerification();
                      if (res.ok) {
                        setCooldown(true);
                        toast.success(t("space.profileEditor.verifySent"));
                      } else toast.error(t("space.profileEditor.notSaved"));
                    })
                  }
                  className="font-bold text-accent hover:underline disabled:opacity-60"
                >
                  {t("space.profileEditor.verifyResend")}
                </button>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type TabProps = {
  data: Draft;
  setData: React.Dispatch<React.SetStateAction<Draft>>;
  queue: (key: string, job: () => Promise<SaveResult>, delay?: number) => void;
  flush: () => void;
};

/** A red asterisk on a required field's label. */
function Req() {
  const t = useTranslations("talents.space.profileEditor");
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-danger">*</span>
      <span className="sr-only"> ({t("required")})</span>
    </>
  );
}

function Field({
  label,
  field,
  hint,
  required,
  optional,
  children,
}: {
  label: string;
  field?: string;
  hint?: string;
  required?: boolean;
  /** "(optional)" after the label, lighter and smaller (round 8b). */
  optional?: string;
  children: React.ReactNode;
}) {
  const missing = useMissingField(required ? field : undefined);
  return (
    <div className="space-y-1.5" data-field={field} data-missing={missing || undefined}>
      <Label>
        {label}
        {required && <Req />}
        {optional && <span className="ml-1 text-xs font-normal text-fg-muted">{optional}</span>}
      </Label>
      {children}
      {missing && <RequiredNote />}
      {hint && <p className="text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

/* ── Identity ─────────────────────────────────────────────────────────── */

function IdentityTab({ data, setData, queue, flush }: TabProps) {
  const t = useTranslations("talents");
  const locale = useLocale();
  const e = "space.profileEditor" as const;
  const nf = new Intl.NumberFormat(locale);
  const p = data.physical;
  const phoneOk = useRef(true);

  // One identity payload: every field the tab owns. Absent values keep the
  // stored ones; the birth date is sent once it is complete.
  function patch(next: Partial<Draft>) {
    const d = { ...data, ...next };
    setData(d);
    queue("identity", () =>
      saveProfileIdentity({
        stageName: d.stageName,
        legalFirstName: d.legalFirstName,
        legalLastName: d.legalLastName,
        gender: d.gender || undefined,
        genderOther: d.genderOther,
        // The phone is sent only once valid (see PhoneField).
        ...(phoneOk.current ? { phone: d.phone, phoneE164: d.phoneE164 || undefined } : {}),
        ...(d.cityGeonameId ? { cityGeonameId: d.cityGeonameId } : {}),
        bio: d.bio,
        languages: d.physical.languages,
        accents: d.physical.accents,
        imdbUrl: d.imdbUrl,
        portfolioUrl: d.portfolioUrl,
        birthDate: d.birthDate || undefined,
      })
    );
  }
  const setP = (next: Partial<PhysicalTraits>) => patch({ physical: { ...p, ...next } });
  const blur = { onBlur: flush };
  const legalMissing = useMissingField("legalName");

  return (
    <div className="max-w-2xl space-y-4">
      <fieldset className="space-y-1.5" data-field="legalName" data-missing={legalMissing || undefined}>
        <legend className="text-sm font-medium">
          {t(`${e}.legalName`)}
          <Req />
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            aria-label={t(`${e}.legalFirstName`)}
            placeholder={t(`${e}.legalFirstName`)}
            autoComplete="given-name"
            value={data.legalFirstName}
            onChange={(ev) => patch({ legalFirstName: ev.target.value })}
            {...blur}
          />
          <Input
            aria-label={t(`${e}.legalLastName`)}
            placeholder={t(`${e}.legalLastName`)}
            autoComplete="family-name"
            value={data.legalLastName}
            onChange={(ev) => patch({ legalLastName: ev.target.value })}
            {...blur}
          />
        </div>
        {legalMissing && <RequiredNote />}
        <p className="text-xs text-fg-muted">{t(`${e}.legalNameHint`)}</p>
      </fieldset>
      <Field label={t(`${e}.stageName`)} field="stageName" hint={t(`${e}.stageNameHint`)}>
        <Input value={data.stageName} onChange={(ev) => patch({ stageName: ev.target.value })} {...blur} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t(`${e}.birthDate`)} field="birthDate" required>
          <Input type="date" value={data.birthDate} onChange={(ev) => patch({ birthDate: ev.target.value })} {...blur} />
        </Field>
      </div>
      <Field label={t(`${e}.city`)} field="city" required>
        <LocationField
          value={{
            countryCode: data.countryCode,
            admin1Code: data.admin1Code,
            cityGeonameId: data.cityGeonameId,
            city: data.city,
          }}
          onChange={(loc) => patch(loc)}
        />
      </Field>
      <Field label={t(`${e}.gender`)} field="gender" hint={t(`${e}.genderHint`)} required>
        <Select value={data.gender || undefined} onValueChange={(gender) => patch({ gender })}>
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
            onChange={(ev) => patch({ genderOther: ev.target.value })}
            {...blur}
          />
        )}
      </Field>
      <Field label={t(`${e}.phone`)} field="phone" required>
        <PhoneField
          initialE164={data.phoneE164 || null}
          initialText={data.phone}
          onValid={({ e164, display }) => {
            phoneOk.current = true;
            patch({ phone: display, phoneE164: e164 });
          }}
          onInvalid={() => {
            phoneOk.current = false;
          }}
        />
      </Field>
      <Field label={t(`${e}.languages`)} field="languages" required>
        <ChipMultiSelect
          label={t(`${e}.languages`)}
          values={p.languages}
          onChange={(languages) => setP({ languages })}
          groups={[{ options: LANGUAGE_NAMES }]}
          match={matchLanguage}
          placeholder={t(`${e}.smart.addLanguage`)}
        />
      </Field>
      <Field label={t(`${e}.accents`)} field="accents">
        <ChipMultiSelect
          label={t(`${e}.accents`)}
          values={p.accents}
          onChange={(accents) => setP({ accents })}
          groups={ACCENT_OPTIONS}
          match={accentMatches}
          placeholder={t(`${e}.smart.addAccent`)}
          none={{ value: NO_ACCENTS, label: t(`${e}.smart.noAccents`) }}
          writeOwn={{ label: t(`${e}.smart.writeOwn`), placeholder: t(`${e}.smart.writeOwnPlaceholder`) }}
        />
      </Field>
      <Field label={t(`${e}.bio`)} field="bio" required>
        <textarea
          value={data.bio}
          onChange={(ev) => patch({ bio: ev.target.value })}
          onBlur={flush}
          rows={6}
          maxLength={BIO_MAX}
          aria-describedby="bio-count"
          className="w-full rounded-sedan border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          placeholder={t(`${e}.bioPlaceholder`)}
        />
        <p id="bio-count" className="text-right text-xs tabular-nums text-fg-muted">
          {nf.format(data.bio.length)} / {nf.format(BIO_MAX)}
        </p>
      </Field>
      <section className="space-y-4 rounded-sedan border border-border bg-surface-2/40 p-4">
        <h3 className="text-[15px] font-bold">{t(`${e}.linksTitle`)}</h3>
        <Field label={t(`${e}.imdbUrl`)} field="imdbUrl" optional={t(`${e}.optional`)}>
          <Input
            type="text"
            inputMode="url"
            value={data.imdbUrl}
            placeholder={t(`${e}.imdbUrlPlaceholder`)}
            onChange={(ev) => patch({ imdbUrl: ev.target.value })}
            {...blur}
          />
        </Field>
        <Field label={t(`${e}.portfolioUrl`)} optional={t(`${e}.optional`)}>
          <Input
            type="text"
            inputMode="url"
            value={data.portfolioUrl}
            placeholder={t(`${e}.portfolioUrlPlaceholder`)}
            onChange={(ev) => patch({ portfolioUrl: ev.target.value })}
            {...blur}
          />
        </Field>
        {/* No portfolio: Limelight builds one. With one: Limelight improves it. */}
        <Button asChild variant={data.portfolioUrl.trim() ? "outline" : "primary"} size="sm">
          <Link href="/talents/app/abonnement#limelight">
            {data.portfolioUrl.trim() ? t(`${e}.improveWebsite`) : t(`${e}.noLinks`)}
          </Link>
        </Button>
      </section>
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
    <Select
      value={known ?? (legacy ? `legacy:${legacy}` : undefined)}
      onValueChange={(v) => onChange(v.startsWith("legacy:") ? v.slice(7) : v)}
    >
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue placeholder={t(`${e}.choose`)} />
      </SelectTrigger>
      <SelectContent data-portal="talents">
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {t(`${e}.options.${optionKey(o)}` as "space.profileEditor.options.other")}
          </SelectItem>
        ))}
        {legacy && (
          <SelectItem value={`legacy:${legacy}`}>{t(`${e}.otherValue`, { value: legacy })}</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

/**
 * Build (round 8c): several choices at once. The list toggles a choice (a check
 * marks the chosen ones), "Add your own" opens a short field for the person's own
 * words. The choices show as chips in the middle of the tile (BuildChips), each
 * one removable. Saved in the same text column, joined by commas.
 */
function BuildSelect({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  const t = useTranslations("talents");
  const e = "space.profileEditor" as const;
  const values = splitMulti(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const isOn = (o: string) => values.some((v) => matchOption([o], v) === o);

  function commit(next: string[]) {
    onChange(joinMulti(next));
    onBlur();
  }
  function toggle(o: string) {
    commit(isOn(o) ? values.filter((v) => matchOption([o], v) !== o) : [...values, o]);
  }
  function addOwn() {
    const clean = draft.replace(/[,;]/g, " ").trim().slice(0, 60);
    setDraft("");
    setEditing(false);
    if (clean && !values.some((v) => v.toLowerCase() === clean.toLowerCase())) commit([...values, clean]);
  }

  return (
    <div className="space-y-1.5">
      <Select value="" onValueChange={(v) => (v === "add" ? setEditing(true) : toggle(v))}>
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue placeholder={values.length ? t(`${e}.addMore`) : t(`${e}.choose`)} />
        </SelectTrigger>
        <SelectContent data-portal="talents">
          {BUILDS.map((o) => (
            <SelectItem key={o} value={o}>
              <span className="inline-flex items-center gap-1.5">
                <Check aria-hidden="true" className={cn("size-3.5 text-accent", !isOn(o) && "invisible")} />
                {t(`${e}.options.${optionKey(o)}` as "space.profileEditor.options.other")}
              </span>
            </SelectItem>
          ))}
          <SelectItem value="add">{t(`${e}.addOwn`)}</SelectItem>
        </SelectContent>
      </Select>
      {editing && (
        <Input
          autoFocus
          aria-label={t(`${e}.addOwn`)}
          maxLength={60}
          placeholder={t(`${e}.addOwnPlaceholder`)}
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              addOwn();
            }
            if (ev.key === "Escape") setEditing(false);
          }}
          onBlur={addOwn}
          className="h-10"
        />
      )}
    </div>
  );
}

/** The Build choices as chips, each with a remove button. */
function BuildChips({ value, onChange }: { value: string | undefined; onChange: (v: string) => void }) {
  const t = useTranslations("talents");
  const e = "space.profileEditor" as const;
  const values = splitMulti(value);
  if (!values.length) return null;
  return (
    <ul className="flex flex-wrap justify-center gap-1">
      {values.map((v) => {
        const known = matchOption(BUILDS, v);
        const shown = known ? t(`${e}.options.${optionKey(known)}` as "space.profileEditor.options.other") : v;
        return (
          <li
            key={v}
            className="inline-flex max-w-full items-center gap-0.5 rounded-full bg-accent-soft py-0.5 pl-2.5 pr-1 text-xs font-medium text-accent-ink"
          >
            <span className="truncate">{shown}</span>
            <button
              type="button"
              aria-label={t(`${e}.smart.remove`, { value: shown })}
              onClick={() => onChange(joinMulti(values.filter((x) => x !== v)))}
              className="rounded-full p-0.5 hover:bg-accent/15"
            >
              <X aria-hidden="true" className="size-3" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** A tile's current value, big and centered (round 8c). */
function TileValue({ children }: { children: React.ReactNode }) {
  return <p className="line-clamp-2 break-words font-display text-lg leading-tight">{children}</p>;
}

/* ── Physical: ten tiles ──────────────────────────────────────────────── */


function Tile({
  icon: Icon,
  label,
  field,
  required,
  value,
  children,
}: {
  icon: LucideIcon;
  label: string;
  field: string;
  required?: boolean;
  /** What is saved, shown in the middle of the tile (round 8c). */
  value?: React.ReactNode;
  children: React.ReactNode;
}) {
  const missing = useMissingField(required ? field : undefined);
  return (
    <div
      data-field={field}
      data-missing={missing || undefined}
      className={cn(
        "flex min-h-40 min-w-0 flex-col gap-3 rounded-sedan-xl border bg-surface p-3 sm:p-4 xl:aspect-square",
        missing ? "border-2 border-danger" : "border-border"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon aria-hidden="true" className="size-[1.125rem]" />
        </span>
        <span className="text-sm font-bold leading-tight">
          {label}
          {required && <Req />}
        </span>
      </div>
      <div className="flex min-h-10 flex-1 flex-col items-center justify-center text-center" aria-live="polite">
        {value}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
      {missing && <RequiredNote />}
    </div>
  );
}

/** "5 ft 10 in · 178 cm": the chosen unit, then the other one in grey. */
function BothUnits({ main, other }: { main: string; other: string }) {
  return (
    <TileValue>
      {main} <span className="font-normal text-fg-muted">· {other}</span>
    </TileValue>
  );
}

function PhysicalTab({ data, setData, queue, flush }: TabProps) {
  const t = useTranslations("talents");
  const e = "space.profileEditor" as const;
  const locale = useLocale();
  const p = data.physical;
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("lb");
  const [weightText, setWeightText] = useState(() => (p.weightKg != null ? String(kgToLb(p.weightKg)) : ""));

  function patch(next: Partial<PhysicalTraits>, height?: HeightValue | null) {
    const physical = { ...p, ...next };
    const h = height === undefined ? data.height : (height ?? undefined);
    setData((d) => ({ ...d, physical, height: h }));
    queue("physical", () =>
      saveProfilePhysical({
        height: h ?? null,
        hair: physical.hair,
        hairLength: physical.hairLength,
        eyes: physical.eyes,
        build: physical.build,
        weightKg: physical.weightKg ?? null,
        tattoos: physical.tattoos,
        piercings: physical.piercings,
        sizeTop: physical.sizeTop,
        sizeBottom: physical.sizeBottom,
        sizeDressSuit: physical.sizeDressSuit,
        shoeSize: physical.shoeSize,
      })
    );
  }

  function setWeight(text: string) {
    setWeightText(text);
    if (!text.trim()) return patch({ weightKg: undefined });
    const kg = weightTextToKg(text, weightUnit);
    if (kg !== undefined) patch({ weightKg: kg });
  }

  // The toggle converts what is saved (73 kg <-> 161 lb); the stored value stays in kg.
  function switchWeightUnit(unit: WeightUnit) {
    if (unit === weightUnit) return;
    setWeightUnit(unit);
    if (p.weightKg != null) setWeightText(String(unit === "lb" ? kgToLb(p.weightKg) : p.weightKg));
  }

  // What each tile shows in its middle: the saved value, in the person's words
  // or the option's label.
  const option = (options: readonly string[], raw: string | undefined) => {
    const v = (raw ?? "").trim();
    if (!v) return null;
    const known = matchOption(options, v);
    return <TileValue>{known ? t(`${e}.options.${optionKey(known)}` as "space.profileEditor.options.other") : v}</TileValue>;
  };
  const plain = (raw: string | undefined) => ((raw ?? "").trim() ? <TileValue>{raw!.trim()}</TileValue> : null);
  const heightCm = heightToCm(data.height);
  const heightShown =
    heightCm != null ? (
      <BothUnits {...heightInBothUnits(heightCm, locale, data.height?.unit === "metric" ? "metric" : "imperial")} />
    ) : null;
  const weightShown = p.weightKg != null ? <BothUnits {...weightInBothUnits(p.weightKg, weightUnit)} /> : null;
  const sizes = (["sizeTop", "sizeBottom", "sizeDressSuit"] as const).filter((k) => (p[k] ?? "").trim());
  const sizesShown = sizes.length ? (
    <ul className="space-y-0.5 text-sm">
      {sizes.map((k) => (
        <li key={k}>
          <span className="text-fg-muted">{t(`${e}.${k}`)}</span> <span className="font-bold">{p[k]!.trim()}</span>
        </li>
      ))}
    </ul>
  ) : null;

  const text = (key: "tattoos" | "piercings" | "shoeSize", label: string, max = 60) => (
    <Input
      aria-label={label}
      maxLength={max}
      value={p[key] ?? ""}
      onChange={(ev) => patch({ [key]: ev.target.value })}
      onBlur={flush}
      className="h-10"
    />
  );

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Tile icon={Ruler} label={t(`${e}.height`)} field="height" required value={heightShown}>
        {/* The field reopens on the draft, an entry the server would refuse included. */}
        <HeightField hideLabel label={t(`${e}.height`)} defaultValue={data.height} onChange={(h) => patch({}, h ?? null)} />
      </Tile>
      <Tile icon={Weight} label={t(`${e}.weight`)} field="weight" value={weightShown}>
        <div className="flex gap-1">
          <Input
            inputMode="decimal"
            aria-label={t(`${e}.weight`)}
            value={weightText}
            onChange={(ev) => setWeight(ev.target.value)}
            onBlur={flush}
            className="h-10 min-w-0"
          />
          <div className="inline-flex shrink-0 items-center rounded-full bg-surface-2 p-0.5 text-xs" role="group" aria-label={t(`${e}.units`)}>
            {(["lb", "kg"] as const).map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={weightUnit === u}
                onClick={() => switchWeightUnit(u)}
                className={cn("rounded-full px-2 py-1", weightUnit === u && "bg-surface font-bold shadow-sm")}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        {p.weightKg != null && (
          <p className="text-xs text-fg-muted" aria-live="polite">
            {weightUnit === "lb" ? `${p.weightKg} kg` : `${kgToLb(p.weightKg)} lb`}
          </p>
        )}
      </Tile>
      <Tile
        icon={PersonStanding}
        label={t(`${e}.build`)}
        field="build"
        required
        value={<BuildChips value={p.build} onChange={(build) => { patch({ build }); flush(); }} />}
      >
        <BuildSelect label={t(`${e}.build`)} value={p.build} onChange={(build) => patch({ build })} onBlur={flush} />
      </Tile>
      <Tile icon={Palette} label={t(`${e}.hair`)} field="hair" required value={option(HAIR_COLORS, p.hair)}>
        <OptionSelect label={t(`${e}.hair`)} options={HAIR_COLORS} value={p.hair} onChange={(hair) => patch({ hair })} />
      </Tile>
      <Tile icon={Scissors} label={t(`${e}.hairLength`)} field="hairLength" value={option(HAIR_LENGTHS, p.hairLength)}>
        <OptionSelect
          label={t(`${e}.hairLength`)}
          options={HAIR_LENGTHS}
          value={p.hairLength}
          onChange={(hairLength) => patch({ hairLength })}
        />
      </Tile>
      <Tile icon={Eye} label={t(`${e}.eyes`)} field="eyes" required value={option(EYE_COLORS, p.eyes)}>
        <OptionSelect label={t(`${e}.eyes`)} options={EYE_COLORS} value={p.eyes} onChange={(eyes) => patch({ eyes })} />
      </Tile>
      <Tile icon={PenTool} label={t(`${e}.tattoos`)} field="tattoos" value={plain(p.tattoos)}>
        {text("tattoos", t(`${e}.tattoos`), 200)}
      </Tile>
      <Tile icon={Gem} label={t(`${e}.piercings`)} field="piercings" value={plain(p.piercings)}>
        {text("piercings", t(`${e}.piercings`), 200)}
      </Tile>
      <Tile icon={Shirt} label={t(`${e}.clothing`)} field="clothing" value={sizesShown}>
        <div className="grid grid-cols-3 gap-1">
          {(["sizeTop", "sizeBottom", "sizeDressSuit"] as const).map((key) => (
            <label key={key} className="space-y-0.5 text-[11px] text-fg-muted">
              <span className="block truncate">{t(`${e}.${key}`)}</span>
              <Input
                maxLength={20}
                value={p[key] ?? ""}
                onChange={(ev) => patch({ [key]: ev.target.value })}
                onBlur={flush}
                className="h-9 px-2 text-sm"
              />
            </label>
          ))}
        </div>
      </Tile>
      <Tile icon={Footprints} label={t(`${e}.shoeSize`)} field="shoeSize" value={plain(p.shoeSize)}>
        {text("shoeSize", t(`${e}.shoeSize`), 20)}
      </Tile>
    </div>
  );
}

/* ── Media: the profile picture as the first headshot ─────────────────── */

function AvatarHeadshot() {
  const t = useTranslations("talents.space.profileEditor");
  const errorText = useActionErrorText();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-sedan border border-accent/40 bg-accent-soft/30 p-4">
      <ImagePlus aria-hidden="true" className="size-5 text-accent" />
      <p className="min-w-0 flex-1 text-sm">{t("avatarHeadshotHint")}</p>
      <Button
        size="sm"
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await avatarAsHeadshot();
            if (!res.ok) toast.error(errorText(res.error) ?? "");
            else {
              toast.success(t("saved"));
              router.refresh();
            }
          })
        }
      >
        {t("avatarHeadshot")}
      </Button>
    </div>
  );
}

/* ── Preferences ──────────────────────────────────────────────────────── */

/**
 * Preferences (round 8b): two columns on wide screens. Left: work types,
 * paid or unpaid, travel, work modes, animals. Right: ages you can play,
 * skills, then `aside` (contact preference and content boundaries). One
 * column on a phone. Each question is numbered in reading order (round 8c):
 * 1 to 6 on the left, 7 to 10 on the right, so the phone column reads 1 to 10.
 */
function PreferencesTab({ data, setData, queue, flush, aside }: TabProps & { aside?: React.ReactNode }) {
  const t = useTranslations("talents");
  const ta = useTranslations("app");
  const locale = useLocale();
  const pr = data.preferences;
  const p = "space.profileEditor.prefs" as const;
  const [rateOpen, setRateOpen] = useState(false);
  const [rateText, setRateText] = useState("");
  const money = (usd: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(usd);

  function setPr(patch: Partial<Preferences>) {
    const next = { ...pr, ...patch };
    setData((d) => ({ ...d, preferences: next }));
    queue("preferences", () =>
      savePreferences({
        projectTypes: next.projectTypes,
        roleTypes: next.roleTypes,
        compensation: next.compensation,
        travel: next.travel,
        workModes: next.workModes,
        animals: next.animals,
        playableAgeMin: next.playableAgeMin,
        playableAgeMax: next.playableAgeMax,
      })
    );
  }

  function openRate() {
    setRateText(data.dayRateUsd ? String(data.dayRateUsd) : "");
    setRateOpen(true);
  }

  function chooseCompensation(v: Preferences["compensation"]) {
    setPr({ compensation: v });
    // Paid work only asks for the minimum day rate (kept if unselected).
    if (v === "paid_only" && !data.dayRateUsd) openRate();
  }

  const rateValue = Number(rateText);
  const rateValid = rateText !== "" && Number.isInteger(rateValue) && rateValue >= 1 && rateValue <= 100000;

  const skills = data.specialties.filter(isSkillSpecialty);
  function setSkills(next: string[]) {
    setData((d) => ({
      ...d,
      specialties: [...d.specialties.filter((k) => !isSkillSpecialty(k)), ...next],
    }));
    queue("skills", () => saveSkills({ skills: next }), 400);
  }

  const ages: [number, number] = [pr.playableAgeMin ?? 18, pr.playableAgeMax ?? 30];
  const agesSet = pr.playableAgeMin != null && pr.playableAgeMax != null;
  const workMissing = useMissingField("projectTypes");
  const payMissing = useMissingField("compensation");
  const agesMissing = useMissingField("ageRange");

  return (
    <div className="grid gap-x-12 gap-y-8 lg:grid-cols-2">
      <div className="min-w-0 space-y-7">
        <div data-field="projectTypes" data-missing={workMissing || undefined} className={cn("space-y-5", workMissing && MISSING_BOX)}>
          {workMissing && <RequiredNote />}
          <ChipGroup
            number={1}
            legend={t(`${p}.projectTypes`)}
            required
            options={PROJECT_TYPES.map((v) => ({ value: v, label: t(`${p}.projectTypeLabels.${v}`) }))}
            selected={pr.projectTypes}
            onChange={(projectTypes) => setPr({ projectTypes })}
          />
          <ChipGroup
            number={2}
            legend={t(`${p}.roleTypes`)}
            options={ROLE_TYPES.map((v) => ({ value: v, label: t(`${p}.roleTypeLabels.${v}`) }))}
            selected={pr.roleTypes}
            onChange={(roleTypes) => setPr({ roleTypes })}
          />
        </div>

        <fieldset data-field="compensation" data-missing={payMissing || undefined} className={cn("space-y-2", payMissing && MISSING_BOX)}>
          <legend className="text-sm font-medium">
            <StepNumber n={3} />
            {t(`${p}.compensation`)}
            <Req />
          </legend>
          <div className="flex flex-wrap items-center gap-2">
            {COMPENSATION.map((v) => {
              const active = pr.compensation === v;
              return (
                <span key={v} className="inline-flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => chooseCompensation(active ? null : v)}
                    className={cn(
                      "min-h-9 rounded-full border px-3 py-1.5 text-sm transition-colors",
                      active ? "border-accent bg-accent-soft text-accent" : "border-border hover:border-accent"
                    )}
                  >
                    {active && <Check aria-hidden="true" className="-ml-0.5 mr-1 inline size-3.5" />}
                    {t(`${p}.compensationLabels.${v}`)}
                  </button>
                  {v === "paid_only" && active && (
                    <span className="text-sm">
                      {data.dayRateUsd ? (
                        <>
                          {t(`${p}.dayRateShown`, { rate: money(data.dayRateUsd) })}{" "}
                          <button type="button" onClick={openRate} className="font-bold text-accent hover:underline">
                            {t(`${p}.edit`)}
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={openRate} className="font-bold text-accent hover:underline">
                          {t(`${p}.dayRateAdd`)}
                        </button>
                      )}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </fieldset>

        <ChipGroup
          single
          number={4}
          legend={t(`${p}.travel`)}
          hint={t(`${p}.clearHint`)}
          options={TRAVEL.map((v) => ({ value: v, label: t(`${p}.travelLabels.${v}`) }))}
          selected={pr.travel ? [pr.travel] : []}
          onChange={(v) => setPr({ travel: v[0] ?? null })}
        />
        <ChipGroup
          number={5}
          legend={t(`${p}.workModes`)}
          options={WORK_MODES.map((v) => ({ value: v, label: t(`${p}.workModeLabels.${v}`) }))}
          selected={pr.workModes}
          onChange={(workModes) => setPr({ workModes })}
        />
        <TriState number={6} legend={t(`${p}.animals`)} value={pr.animals} onChange={(animals) => setPr({ animals })} />
      </div>
      <div className="min-w-0 space-y-7">
        <fieldset data-field="ageRange" data-missing={agesMissing || undefined} className={cn("space-y-3", agesMissing && MISSING_BOX)}>
          <legend className="text-sm font-medium">
            <StepNumber n={7} />
            {t(`${p}.ageRange`)}
            <Req />
          </legend>
          <p className="font-display text-xl tabular-nums" aria-live="polite">
            {agesSet ? t(`${p}.ageRangeValue`, { from: ages[0], to: ages[1] }) : t(`${p}.ageRangeUnset`)}
          </p>
          <Slider
            min={AGE_MIN}
            max={AGE_MAX}
            step={1}
            value={ages}
            thumbLabels={[t(`${p}.ageFrom`), t(`${p}.ageTo`)]}
            onValueChange={(v) => {
              // Radix keeps the thumbs in order: "to" can never be below "from".
              const [from, to] = v as [number, number];
              setData((d) => ({ ...d, preferences: { ...d.preferences, playableAgeMin: from, playableAgeMax: to } }));
            }}
            onValueCommit={(v) => {
              const [from, to] = v as [number, number];
              setPr({ playableAgeMin: from, playableAgeMax: to });
            }}
            className="max-w-md"
          />
        </fieldset>

        <section className="space-y-3" data-field="skills">
          <div>
            <h3 className="font-display text-lg font-medium">
              <StepNumber n={8} />
              {t(`${p}.skills`)}
            </h3>
            <p className="text-sm text-fg-muted">{t(`${p}.skillsHint`)}</p>
          </div>
          <ChipGroup
            legend={t(`${p}.skills`)}
            hideLegend
            options={SKILLS.map((k) => ({ value: k, label: ta(`specialties.${k}`) }))}
            selected={skills}
            onChange={(next) => {
              setSkills(next);
              flush();
            }}
          />
        </section>
        {aside}
      </div>

      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent data-portal="talents">
          <DialogHeader>
            <DialogTitle>{t(`${p}.dayRateTitle`)}</DialogTitle>
            <DialogDescription>{t(`${p}.dayRateHint`)}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">$</span>
            <Input
              autoFocus
              inputMode="numeric"
              aria-label={t(`${p}.dayRateTitle`)}
              value={rateText}
              onChange={(ev) => setRateText(ev.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRateOpen(false)}>
              {t(`${p}.cancel`)}
            </Button>
            <Button
              disabled={!rateValid}
              onClick={() => {
                setData((d) => ({ ...d, dayRateUsd: rateValue }));
                queue("dayRate", () => saveDayRate({ usd: rateValue }), 0);
                setRateOpen(false);
              }}
            >
              {t(`${p}.save`)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Optional and private: shown to the performer only, saved by its own
 * action, and never part of the job preferences above.
 */
function ContentBoundariesSection({ data, setData, queue, number }: TabProps & { number?: number }) {
  const t = useTranslations("talents");
  const b = "space.profileEditor.boundaries" as const;
  return (
    <section
      aria-labelledby="content-boundaries"
      className="space-y-4 rounded-sedan border border-border bg-surface-2/50 p-5"
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="content-boundaries" className="font-display text-lg font-medium">
            <StepNumber n={number} />
            {t(`${b}.title`)}
          </h3>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-fg-muted">
            {t(`${b}.optional`)}
          </span>
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-fg-muted">
          <Lock aria-hidden="true" className="size-3.5" />
          {t(`${b}.private`)}
        </p>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t(`${b}.question`)}</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t(`${b}.question`)}>
          {MATURITY_RATINGS.map((r) => {
            const active = data.contentBoundaries.maxRating === r;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={active}
                title={t(`${b}.ratings.${r}`)}
                onClick={() => {
                  // Pressing the chosen rating again clears it.
                  const maxRating = active ? null : r;
                  setData((d) => ({ ...d, contentBoundaries: { ...d.contentBoundaries, maxRating } }));
                  queue("boundaries", () => saveContentBoundaries({ maxRating }), 0);
                }}
                className={cn(
                  "min-w-14 rounded-full border px-3 py-1.5 text-sm font-bold transition-colors",
                  active ? "border-accent bg-accent-soft text-accent" : "border-border hover:border-accent"
                )}
              >
                {r}
              </button>
            );
          })}
        </div>
        {data.contentBoundaries.maxRating && (
          <p className="text-xs text-fg-muted">{t(`${b}.ratings.${data.contentBoundaries.maxRating}`)}</p>
        )}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          {t(`${b}.limits`)}
          <span className="ml-1 text-xs font-normal text-fg-muted">{t(`${b}.optional`)}</span>
        </legend>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--accent)]"
            checked={data.contentBoundaries.nudity === false}
            onChange={(ev) => {
              const nudity = ev.target.checked ? false : null;
              setData((d) => ({ ...d, contentBoundaries: { ...d.contentBoundaries, nudity } }));
              queue("boundaries", () => saveContentBoundaries({ nudity }), 0);
            }}
          />
          {t(`${b}.noNudity`)}
        </label>
      </fieldset>
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
  required = false,
  hideLegend = false,
  number,
}: {
  number?: number;
  legend: string;
  hint?: string;
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
  single?: boolean;
  required?: boolean;
  hideLegend?: boolean;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className={cn("text-sm font-medium", hideLegend && "sr-only")}>
        <StepNumber n={number} />
        {legend}
        {required && <Req />}
      </legend>
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
                  active ? selected.filter((v) => v !== o.value) : single ? [o.value] : [...selected, o.value]
                )
              }
              className={cn(
                "min-h-9 rounded-full border px-3 py-1.5 text-sm transition-colors",
                active ? "border-accent bg-accent-soft text-accent" : "border-border hover:border-accent"
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
  number,
}: {
  number?: number;
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
      <legend className="text-sm font-medium">
        <StepNumber n={number} />
        {legend}
      </legend>
      <div className="inline-flex flex-wrap gap-1 rounded-sedan bg-surface-2 p-1">
        {choices.map((c) => (
          <label
            key={c.key}
            className="cursor-pointer rounded-[calc(var(--sedan)-0.25rem)] px-3 py-1.5 text-sm text-fg-muted transition-colors has-[:checked]:bg-surface has-[:checked]:font-medium has-[:checked]:text-fg has-[:checked]:shadow-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          >
            <input type="radio" name={name} className="sr-only" checked={value === c.v} onChange={() => onChange(c.v)} />
            {c.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
