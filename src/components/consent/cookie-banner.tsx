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
      className="fixed inset-x-0 bottom-0 z-50 max-h-[85svh] overflow-y-auto border-t border-border-strong bg-surface text-fg shadow-xl"
    >
      <div className="mx-auto max-w-5xl px-4 py-3">
        {managing ? (
          <ConsentChoice onChosen={choose} writeCookie={false} />
        ) : (
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-6">
            <p className="flex items-start gap-2 text-[14px] leading-snug text-fg-muted md:max-w-2xl">
              <Cookie aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
              <span>
                {t("bannerLead")}{" "}
                <Link href="/talents/confidentialite#cookies" className="font-bold text-accent underline-offset-4 hover:underline">
                  {t("readMore")}
                </Link>
              </span>
            </p>
            <div className="grid shrink-0 grid-cols-3 gap-2 md:flex">
              <Button size="md" className="whitespace-normal px-2 text-[13px] leading-tight" onClick={() => choose({ analytics: true, marketing: true })}>
                {t("acceptAll")}
              </Button>
              <Button size="md" variant="secondary" className="whitespace-normal border-border-strong px-2 text-[13px] leading-tight" onClick={() => choose(NECESSARY_ONLY)}>
                {t("reject")}
              </Button>
              <Button size="md" variant="secondary" className="whitespace-normal border-border-strong px-2 text-[13px] leading-tight" onClick={() => setManaging(true)}>
                {t("bannerManage")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
