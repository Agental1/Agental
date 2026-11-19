"use client";

import { useSyncExternalStore } from "react";
import Script from "next/script";
import { CONSENT_EVENT, readConsent } from "@/components/consent/consent-cookie";

function subscribe(onChange: () => void) {
  window.addEventListener(CONSENT_EVENT, onChange);
  return () => window.removeEventListener(CONSENT_EVENT, onChange);
}

/**
 * Audience measurement.
 *
 * Three deliberate constraints:
 *
 * 1. NO new dependency. A script tag does the job.
 * 2. NO cookies. Plausible measures without them.
 * 3. OFF unless configured, and OFF until the visitor accepts analytics in
 *    their cookie choice. Absent the env var, or absent consent, this renders
 *    nothing: no script is requested at all.
 *
 * Locale segmentation is free: /fr, /en and /es are distinct paths.
 */
export function Analytics() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  const src = process.env.NEXT_PUBLIC_PLAUSIBLE_SRC ?? "https://plausible.io/js/script.js";
  const allowed = useSyncExternalStore(
    subscribe,
    () => readConsent()?.analytics === true,
    () => false
  );

  if (!domain || !allowed) return null;

  return <Script defer data-domain={domain} src={src} strategy="afterInteractive" />;
}
