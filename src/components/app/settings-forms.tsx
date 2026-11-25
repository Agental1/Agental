"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LANG_TAG, LOCALE_NAMES, LOCALES_SORTED, type Locale } from "@/i18n/routing";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { useActionErrorText } from "@/components/app/action-error";
import { saveLanguage, saveNotifications } from "@/app/actions/settings";

/** Language: saved on the account, then the app switches to it. */
export function LanguageForm({ current }: { current: Locale }) {
  const t = useTranslations("talents.space.settings.language");
  const errorText = useActionErrorText();
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState<Locale>(current);

  function change(next: string) {
    const target = next as Locale;
    setValue(target);
    start(async () => {
      const res = await saveLanguage({ locale: target });
      if (!res.ok) {
        setValue(locale);
        toast.error(errorText(res.error) ?? "");
        return;
      }
      toast.success(t("saved"));
      router.replace(pathname, { locale: target });
    });
  }

  // Round 11: eight languages, a search field, the list in alphabetical order.
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LOCALES_SORTED;
    return LOCALES_SORTED.filter((l) => {
      const n = LOCALE_NAMES[l];
      return n.native.toLowerCase().includes(q) || n.english.toLowerCase().includes(q) || l.startsWith(q);
    });
  }, [query]);

  return (
    <div className="max-w-sm space-y-2">
      <label id="language-label" htmlFor="language-search" className="text-sm font-medium">
        {t("label")}
      </label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
        <Input
          id="language-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          aria-controls="language-list"
          className="pl-9"
          autoComplete="off"
        />
      </div>
      <div
        id="language-list"
        role="radiogroup"
        aria-labelledby="language-label"
        className="max-h-80 divide-y divide-border overflow-y-auto rounded-sedan border border-border bg-surface"
      >
        {shown.length === 0 && <p role="status" className="px-3 py-3 text-sm text-fg-muted">{t("noMatch")}</p>}
        {shown.map((l) => {
          const n = LOCALE_NAMES[l];
          const selected = l === value;
          return (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={pending}
              onClick={() => !selected && change(l)}
              className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-[15px] hover:bg-accent-soft/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:opacity-60"
            >
              <span lang={LANG_TAG[l]} className={selected ? "font-bold" : undefined}>
                {n.native}
              </span>
              {n.native !== n.english && <span className="text-fg-muted">({n.english})</span>}
              {selected && <Check aria-hidden="true" className="ml-auto size-4 text-accent" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Prefs = { roles: boolean; applications: boolean; messages: boolean; product: boolean };

/** Email notifications: each switch saves on its own. */
export function NotificationsForm({ initial }: { initial: Prefs }) {
  const t = useTranslations("talents.space.settings.notifications");
  const errorText = useActionErrorText();
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [pending, start] = useTransition();

  function toggle(key: keyof Prefs, on: boolean) {
    const before = prefs;
    const next = { ...prefs, [key]: on };
    setPrefs(next);
    start(async () => {
      const res = await saveNotifications(next);
      if (!res.ok) {
        setPrefs(before);
        toast.error(errorText(res.error) ?? "");
        return;
      }
      toast.success(t("saved"));
    });
  }

  const rows: { key: keyof Prefs }[] = [{ key: "roles" }, { key: "applications" }, { key: "messages" }, { key: "product" }];
  return (
    <ul className="space-y-2">
      {rows.map(({ key }) => (
        <li key={key} className="flex items-start justify-between gap-4 rounded-sedan border border-border px-4 py-3">
          <span id={`notify-${key}`} className="block">
            <span className="block font-bold leading-snug">{t(key)}</span>
            <span className="mt-0.5 block text-[14px] leading-snug text-fg-muted">{t(`${key}Body`)}</span>
          </span>
          <Switch
            aria-labelledby={`notify-${key}`}
            checked={prefs[key]}
            disabled={pending}
            onCheckedChange={(on) => toggle(key, on)}
            className="mt-1 shrink-0"
          />
        </li>
      ))}
    </ul>
  );
}
