import Script from "next/script";

/**
 * Audience measurement.
 *
 * The repo had none — no analytics package, no instrumentation.ts, nothing —
 * which meant no work shipped here could ever be evaluated. Notably, the whole
 * "was Spanish worth building" question is unanswerable without it.
 *
 * Three deliberate constraints:
 *
 * 1. NO new dependency. A script tag does the job; a package would pull a
 *    client bundle for something that is one <script>.
 * 2. NO cookies. Plausible and comparable tools measure without them, so this
 *    needs no consent banner and opens no GDPR workstream inside a lot that is
 *    about SEO and translation.
 * 3. OFF unless configured. Absent the env var this renders nothing, so local
 *    development and preview deployments stay silent instead of polluting
 *    production numbers.
 *
 * Locale segmentation is free: /fr, /en and /es are distinct paths, so the
 * per-locale split needed to judge the Spanish bet shows up in any pageview
 * report without extra tagging.
 */
export function Analytics() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  const src =
    process.env.NEXT_PUBLIC_PLAUSIBLE_SRC ??
    "https://plausible.io/js/script.js";

  if (!domain) return null;

  return <Script defer data-domain={domain} src={src} strategy="afterInteractive" />;
}
