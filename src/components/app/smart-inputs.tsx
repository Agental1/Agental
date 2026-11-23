"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { changeCountry, editPhone, type PhoneEditResult } from "@/domain/phone-input";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const triggerClass =
  "flex h-11 w-full items-center justify-between gap-2 rounded-sedan border border-[var(--field-border)] bg-surface px-3 text-left text-sm text-fg focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60";

/** A flag from a country code (regional indicator letters). */
export function flag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

/** One choice from a local list, with a search box. */
export function SearchSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled,
  short,
}: {
  label: string;
  value: string | null;
  options: { value: string; label: string; keywords?: string[] }[];
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  /** What the closed button shows for a value (e.g. the flag and +1). */
  short?: (value: string) => string;
}) {
  const t = useTranslations("talents.space.profileEditor.smart");
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={label} disabled={disabled} className={triggerClass}>
          <span className={cn("truncate", !current && "text-fg-subtle")}>
            {current ? (short ? short(current.value) : current.label) : placeholder}
          </span>
          <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
        </button>
      </PopoverTrigger>
      <PopoverContent data-portal="talents" align="start" className="w-[min(22rem,90vw)] p-0">
        <Command>
          <CommandInput placeholder={t("search")} />
          <CommandList>
            <CommandEmpty>{t("noMatch")}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.value}`}
                  keywords={o.keywords}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", o.value === value ? "opacity-100" : "opacity-0")} />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export interface LocationValue {
  countryCode: string | null;
  admin1Code: string | null;
  cityGeonameId: number | null;
  /** The picked city's name, or the free text kept from before round 8. */
  city: string;
}

type Place = { code: string; name: string };
type City = { geonameId: number; name: string; admin1Code: string };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

/**
 * Country (United States by default), then state or province where the
 * country has them, then a city picked from the suggestions. Free text is
 * refused: only a picked city is saved (round 8, GeoNames in our database).
 */
export function LocationField({
  value,
  onChange,
}: {
  value: LocationValue;
  /** Called only with a complete, valid choice (a picked city). */
  onChange: (v: LocationValue) => void;
}) {
  const t = useTranslations("talents.space.profileEditor.smart");
  const [countries, setCountries] = useState<Place[]>([]);
  const [states, setStates] = useState<Place[]>([]);
  const [country, setCountry] = useState(value.countryCode ?? "US");
  const [admin1, setAdmin1] = useState<string | null>(value.admin1Code);
  const [query, setQuery] = useState("");
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string>(value.cityGeonameId ? value.city : "");
  const legacy = !value.cityGeonameId && value.city.trim() ? value.city : null;

  useEffect(() => {
    getJson<Place[]>("/api/geo?type=countries").then(setCountries, () => setCountries([]));
  }, []);
  useEffect(() => {
    let live = true;
    getJson<Place[]>(`/api/geo?type=admin1&country=${country}`).then(
      (rows) => live && setStates(rows),
      () => live && setStates([])
    );
    return () => {
      live = false;
    };
  }, [country]);
  useEffect(() => {
    if (!open || query.trim().length < 1) return;
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ type: "cities", country, q: query.trim() });
      if (admin1) params.set("admin1", admin1);
      getJson<City[]>(`/api/geo?${params}`)
        .then((rows) => live && setCities(rows), () => live && setCities([]))
        .finally(() => live && setLoading(false));
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, country, admin1, open]);

  const hasStates = states.length > 0;
  const stateName = (code: string) => states.find((s) => s.code === code)?.name ?? code;

  return (
    <div className="space-y-2">
      <div className={cn("grid gap-2", hasStates ? "sm:grid-cols-2" : "")}>
        <SearchSelect
          label={t("country")}
          value={country}
          placeholder={t("country")}
          options={countries.map((c) => ({ value: c.code, label: `${flag(c.code)} ${c.name}` }))}
          onChange={(c) => {
            setCountry(c);
            setAdmin1(null);
            setPicked("");
            setCities([]);
          }}
        />
        {hasStates && (
          <SearchSelect
            label={t("state")}
            value={admin1}
            placeholder={t("state")}
            options={states.map((s) => ({ value: s.code, label: s.name }))}
            onChange={(s) => {
              setAdmin1(s);
              setPicked("");
              setCities([]);
            }}
          />
        )}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" data-focus-target aria-haspopup="listbox" aria-expanded={open} aria-label={t("city")} className={triggerClass}>
            <span className={cn("truncate", !picked && "text-fg-subtle")}>
              {picked || (legacy ? t("legacyCity", { city: legacy }) : t("cityPlaceholder"))}
            </span>
            <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
          </button>
        </PopoverTrigger>
        <PopoverContent data-portal="talents" align="start" className="w-[min(22rem,90vw)] p-0">
          <Command shouldFilter={false}>
            <CommandInput placeholder={t("cityPlaceholder")} value={query} onValueChange={setQuery} />
            <CommandList>
              {loading && (
                <div className="flex items-center gap-2 p-3 text-sm text-fg-muted">
                  <Loader2 className="size-4 animate-spin" /> {t("searching")}
                </div>
              )}
              {!loading && query.trim() && cities.length === 0 && <CommandEmpty>{t("noCity")}</CommandEmpty>}
              <CommandGroup>
                {cities.map((c) => (
                  <CommandItem
                    key={c.geonameId}
                    value={String(c.geonameId)}
                    onSelect={() => {
                      setPicked(c.name);
                      setAdmin1(c.admin1Code || admin1);
                      setOpen(false);
                      onChange({
                        countryCode: country,
                        admin1Code: c.admin1Code || null,
                        cityGeonameId: c.geonameId,
                        city: c.name,
                      });
                    }}
                  >
                    <span className="truncate">{c.name}</span>
                    {c.admin1Code && hasStates && (
                      <span className="ml-auto text-xs text-fg-muted">{stateName(c.admin1Code)}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <p className="border-t border-border px-3 py-2 text-xs text-fg-muted">{t("cityHelp")}</p>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const COUNTRY_CODES = getCountries();

/**
 * Phone: the country code on the left (flag and +1 by default), the number on
 * the right, formatted as typed ((213) 222-7981 for +1). Saved as E.164 only
 * when the number is valid.
 */
export function PhoneField({
  initialE164,
  initialText,
  onValid,
  onInvalid,
}: {
  initialE164: string | null;
  /** What was typed before round 8, shown when it does not parse. */
  initialText: string;
  onValid: (v: { e164: string; display: string }) => void;
  onInvalid: () => void;
}) {
  const t = useTranslations("talents.space.profileEditor.smart");
  const parsed = useMemo(
    () => parsePhoneNumberFromString(initialE164 ?? initialText ?? "", "US"),
    [initialE164, initialText]
  );
  const [country, setCountry] = useState<CountryCode>(parsed?.country ?? "US");
  const [text, setText] = useState(parsed?.isValid() ? parsed.formatNational() : initialText);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Round 10: the caret goes back after the same digit once React has rendered
  // the reformatted text, so it never jumps to the end.
  const caretRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (el && caretRef.current != null && document.activeElement === el) {
      el.setSelectionRange(caretRef.current, caretRef.current);
    }
    caretRef.current = null;
  }, [text]);
  const regions = useMemo(() => {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return COUNTRY_CODES.map((c) => ({
      value: c,
      label: `${flag(c)} ${names.of(c) ?? c} +${getCountryCallingCode(c)}`,
      keywords: [`+${getCountryCallingCode(c)}`, c],
    })).sort((a, b) => a.label.slice(3).localeCompare(b.label.slice(3)));
  }, []);

  function apply(r: PhoneEditResult) {
    caretRef.current = r.caret;
    setText(r.text);
    if (r.country !== country) setCountry(r.country);
    if (r.empty) {
      setError(false);
      return;
    }
    if (r.e164 && r.display) {
      setError(false);
      onValid({ e164: r.e164, display: r.display });
    } else {
      setError(true);
      onInvalid();
    }
  }

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[8.5rem_1fr] gap-2">
        <SearchSelect
          label={t("phoneCountry")}
          value={country}
          placeholder="+1"
          options={regions}
          short={(c) => `${flag(c)} +${getCountryCallingCode(c as CountryCode)}`}
          onChange={(c) => {
            setCountry(c as CountryCode);
            apply(changeCountry(text, c as CountryCode));
          }}
        />
        <Input
          data-focus-target
          type="tel"
          autoComplete="tel-national"
          inputMode="tel"
          aria-label={t("phone")}
          aria-invalid={error || undefined}
          ref={inputRef}
          value={text}
          onChange={(e) => {
            const native = e.nativeEvent as InputEvent;
            apply(
              editPhone({
                prev: text,
                next: e.target.value,
                caret: e.target.selectionStart ?? e.target.value.length,
                country,
                forward: native.inputType === "deleteContentForward",
              })
            );
          }}
        />
      </div>
      {error && <p role="alert" className="text-xs text-danger">{t("phoneInvalid")}</p>}
    </div>
  );
}

/**
 * Several choices as chips (languages, accents): type to search, pick one, it
 * becomes a chip, keep typing. "Other" adds what was typed as free text.
 * `none` (accents, round 8b) is a first option that means "none of these":
 * choosing it clears the others, and choosing anything else clears it.
 */
export function ChipMultiSelect({
  label,
  values,
  onChange,
  groups,
  match,
  placeholder,
  none,
  writeOwn,
}: {
  /**
   * Round 10 (accents): a last option, "Other: write your own". It puts the
   * cursor in the search box; what is typed then becomes a chip on Enter.
   */
  writeOwn?: { label: string; placeholder: string };
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  groups: { heading?: string; options: string[] }[];
  /** Does an option match the query (names, codes, any word)? */
  match: (option: string, query: string) => boolean;
  placeholder: string;
  /** A first option meaning "none": stored as `value`, shown as `label`. */
  none?: { value: string; label: string };
}) {
  const t = useTranslations("talents.space.profileEditor.smart");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [writing, setWriting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const add = (v: string) => {
    const clean = v.trim().slice(0, 60);
    // Typing the stored "none" value itself means the none option.
    if (none && (clean.toLowerCase() === none.value.toLowerCase() || clean.toLowerCase() === none.label.toLowerCase())) {
      onChange([none.value]);
      setQuery("");
      return;
    }
    const rest = none ? values.filter((x) => x !== none.value) : values;
    if (!clean || rest.some((x) => x.toLowerCase() === clean.toLowerCase())) return;
    onChange([...rest, clean]);
    setQuery("");
  };
  const chooseNone = () => {
    if (!none) return;
    onChange([none.value]);
    setQuery("");
    setOpen(false);
  };
  const showNone =
    !!none && !values.includes(none.value) && (!query.trim() || none.label.toLowerCase().includes(query.trim().toLowerCase()));
  const filtered = groups
    .map((g) => ({ ...g, options: g.options.filter((o) => !values.includes(o) && match(o, query)) }))
    .filter((g) => g.options.length > 0);
  const exact = groups.some((g) => g.options.some((o) => o.toLowerCase() === query.trim().toLowerCase()));

  return (
    <div className="space-y-2">
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={label}>
          {values.map((v) => (
            <li key={v} className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-1 text-sm text-accent">
              {none && v === none.value ? none.label : v}
              <button
                type="button"
                aria-label={t("remove", { value: none && v === none.value ? none.label : v })}
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="rounded-full p-0.5 hover:bg-accent/15"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setWriting(false);
        }}
      >
        <PopoverTrigger asChild>
          <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={label} className={triggerClass}>
            <span className="truncate text-fg-subtle">{placeholder}</span>
            <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
          </button>
        </PopoverTrigger>
        <PopoverContent data-portal="talents" align="start" className="w-[min(22rem,90vw)] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              ref={searchRef}
              placeholder={writing && writeOwn ? writeOwn.placeholder : t("search")}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-72">
              {writing && query.trim() && !exact && (
                <CommandGroup heading={t("other")}>
                  <CommandItem value={`own:${query}`} onSelect={() => add(query)}>
                    {t("addOther", { value: query.trim() })}
                  </CommandItem>
                </CommandGroup>
              )}
              {showNone && none && (
                <CommandGroup>
                  <CommandItem value={`none:${none.value}`} onSelect={chooseNone}>
                    {none.label}
                  </CommandItem>
                </CommandGroup>
              )}
              {filtered.map((g, i) => (
                <CommandGroup key={g.heading ?? i} heading={g.heading}>
                  {g.options.slice(0, query ? 50 : 400).map((o) => (
                    <CommandItem key={o} value={o} onSelect={() => add(o)}>
                      {o}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              {!writing && query.trim() && !exact && (
                <CommandGroup heading={t("other")}>
                  <CommandItem value={`other:${query}`} onSelect={() => add(query)}>
                    {t("addOther", { value: query.trim() })}
                  </CommandItem>
                </CommandGroup>
              )}
              {writeOwn && !query.trim() && (
                <CommandGroup>
                  <CommandItem
                    value="write-own"
                    onSelect={() => {
                      setWriting(true);
                      window.setTimeout(() => searchRef.current?.focus(), 0);
                    }}
                  >
                    {writeOwn.label}
                  </CommandItem>
                </CommandGroup>
              )}
              {!query.trim() && filtered.length === 0 && !showNone && !writeOwn && <CommandEmpty>{t("noMatch")}</CommandEmpty>}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
