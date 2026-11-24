"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Cookie } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { saveConsent } from "@/app/actions/consent";
import { ConsentChoice } from "./consent-choice";
import {
  CONSENT_EVENT,
  NECESSARY_ONLY,
  consentNeedsAnswer,
  readConsentRecord,
  writeConsent,
  type Consent,
} from "./consent-cookie";

function subscribe(onChange: () => void) {
  window.addEventListener(CONSENT_EVENT, onChange);
  return () => window.removeEventListener(CONSENT_EVENT, onChange);
}

/**
 * The cookie banner, the standard way: it shows while there is no recorded
 * choice (or one made under an older notice) and goes away the moment the
 * visitor answers, for good. Accepting and refusing take one click each. The
 * choice is stored with its date and the notice version, in the browser for
 * visitors and on the account when signed in (saveConsent), and can be changed
 * in Settings > Privacy and cookies.
 *
 * It renders nothing on the server and until the browser has been read, so a
 * visitor who already answered never sees it flash.
 */
export function CookieBanner() {
  const t = useTranslations("common.consent");
  const [managing, setManaging] = useState(false);
  // The cookie is the snapshot: it changes exactly when a choice is written.
  // The server snapshot is "done", so nothing renders on the server or during
  // hydration, and the banner appears only once the browser has been read.
  const needsAnswer = useSyncExternalStore(
    subscribe,
    () => (consentNeedsAnswer(readConsentRecord()) ? "ask" : "done"),
    () => "done"
  );

  if (needsAnswer !== "ask") return null;

  function choose(consent: Consent) {
    // Local first, so the banner leaves at once; then the account (signed in)
    // or the server cookie (visitor). A failed save never brings it back.
    writeConsent(consent);
    void saveConsent(consent).catch(() => undefined);
  }

  return (
    <section
      role="region"
      aria-label={t("title")}
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-h-[85svh] max-w-xl overflow-y-auto rounded-sedan-xl border border-border-strong bg-surface p-4 text-fg shadow-xl sm:left-auto sm:right-4 sm:mx-0 sm:bottom-4 sm:w-[26rem]"
    >
      <h2 className="flex items-center gap-2 text-[1.0625rem]">
        <Cookie aria-hidden="true" className="size-5 text-accent" />
        {t("title")}
      </h2>
      <p className="mt-1 text-[14px] leading-snug text-fg-muted">
        {t("bannerLead")}{" "}
        <Link href="/talents/confidentialite#cookies" className="font-bold text-accent underline-offset-4 hover:underline">
          {t("readMore")}
        </Link>
        {" · "}
        {/* Round 11: the same policy says we may delete unverified or abusive accounts. */}
        <Link href="/talents/confidentialite#security" className="font-bold text-accent underline-offset-4 hover:underline">
          {t("accountSecurity")}
        </Link>
      </p>
      {managing ? (
        <ConsentChoice className="mt-3" onChosen={choose} writeCookie={false} />
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button onClick={() => choose({ analytics: true, marketing: true })}>{t("acceptAll")}</Button>
          <Button variant="secondary" className="border-border-strong" onClick={() => choose(NECESSARY_ONLY)}>
            {t("reject")}
          </Button>
          <Button variant="secondary" className="border-border-strong sm:col-span-2" onClick={() => setManaging(true)}>
            {t("manage")}
          </Button>
        </div>
      )}
    </section>
  );
}
