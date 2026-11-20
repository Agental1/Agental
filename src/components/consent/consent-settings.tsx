"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Cookie } from "lucide-react";
import { saveConsent } from "@/app/actions/consent";
import { err, type ActionError } from "@/domain/action-result";
import { ActionErrorMessage } from "@/components/app/action-error";
import { ConsentChoice } from "./consent-choice";
import {
  NECESSARY_ONLY,
  effectiveConsent,
  readConsent,
  writeConsent,
  type Consent,
} from "./consent-cookie";

/**
 * "Cookie preferences" in Settings: the same choice as at sign-up, changeable
 * at any time. The toggles start from what this browser actually applies
 * (the stricter of this browser's and the account's choice, see
 * effectiveConsent).
 *
 * The browser takes a new choice only once the account has saved it, and the
 * buttons wait while a save is in flight, so the browser never holds a choice
 * the account does not have. If the save fails, the browser keeps (or gets
 * back, should the server have set the cookie already) the choice it had,
 * the form is reset to it and the error is shown.
 */
export function ConsentSettings({ current }: { current: Consent | null }) {
  const t = useTranslations("common.consent");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<ActionError | undefined>();
  const [formKey, setFormKey] = useState(0);
  const [shown, setShown] = useState<Consent | null>(() => effectiveConsent(readConsent(), current));

  async function save(consent: Consent) {
    const before = readConsent();
    setStatus("saving");
    setError(undefined);
    let failure: ActionError | undefined;
    try {
      const res = await saveConsent(consent);
      if (!res.ok) failure = res.error;
    } catch {
      failure = err("errors.generic");
    }
    if (failure) {
      writeConsent(before ?? NECESSARY_ONLY);
      setShown(before ?? NECESSARY_ONLY);
      setFormKey((k) => k + 1);
      setError(failure);
      setStatus("idle");
      return;
    }
    writeConsent(consent);
    setShown(consent);
    setStatus("saved");
  }

  return (
    <section className="rounded-sedan-xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 text-[1.125rem]">
        <Cookie aria-hidden="true" className="size-5 text-accent" />
        {t("settingsTitle")}
      </h2>
      <p className="mt-1 max-w-[60ch] text-[15px] text-fg-muted">{t("lead")}</p>
      <ConsentChoice
        key={formKey}
        className="mt-4"
        initial={shown}
        writeCookie={false}
        disabled={status === "saving"}
        onChosen={(consent) => void save(consent)}
      />
      <ActionErrorMessage error={error} className="mt-3" />
      <p role="status" className="mt-3 min-h-5 text-[14px] font-bold text-success">
        {status === "saved" ? t("saved") : ""}
      </p>
    </section>
  );
}
