"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { useActionErrorText } from "@/components/app/action-error";
import { saveLanguage, saveNotifications } from "@/app/actions/settings";

const NAMES: Record<Locale, string> = { en: "English", fr: "Français", es: "Español", zh: "中文" };

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

  return (
    <div className="max-w-xs space-y-1.5">
      <label id="language-label" className="text-sm font-medium">
        {t("label")}
      </label>
      <Select value={value} onValueChange={change} disabled={pending}>
        <SelectTrigger aria-labelledby="language-label" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {routing.locales.map((l) => (
            <SelectItem key={l} value={l} lang={l}>
              {NAMES[l]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
