"use client";

import Script from "next/script";

/**
 * Cloudflare Turnstile, when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. Inside a
 * form it adds the hidden field cf-turnstile-response, which the server
 * checks (src/lib/abuse.ts). Absent the key, it renders nothing.
 */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export function Captcha() {
  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
      <div className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} data-size="flexible" />
    </>
  );
}

/** The token the widget left in the page, for forms sent without FormData. */
export function captchaToken(scope: HTMLElement | null): string | undefined {
  const input = scope?.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
  return input?.value || undefined;
}
