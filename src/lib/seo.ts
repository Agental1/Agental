import type { Metadata } from "next";
import { routing } from "@/i18n/routing";

/**
 * Canonical origin for every absolute URL the app emits (metadataBase, sitemap,
 * robots, Open Graph). Single source of truth on purpose: the domain used to be
 * inlined in three files as `agental.fr`, which is a parked domain the project
 * does not own — every canonical and hreflang pointed at a third party.
 *
 * Override per environment (Vercel previews must not claim production
 * canonicals) via NEXT_PUBLIC_SITE_URL. Trailing slashes are stripped so
 * `${SITE}${path}` never doubles up.
 */
export const SITE = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://agental.co"
).replace(/\/+$/, "");

/**
 * Absolute URL for a locale-prefixed path. `path` is the route WITHOUT a locale
 * segment ("/talents", "/castings/figuration"); "/" yields the locale root.
 *
 * Shared by sitemap.ts and the metadata helpers so the two can never disagree —
 * two URL builders that drift produce hreflang pointing at pages that do not
 * exist, and nothing fails loudly when they do.
 */
export function localeUrl(locale: string, path: string): string {
  const clean = path === "/" ? "" : path.replace(/\/+$/, "");
  return `${SITE}/${locale}${clean}`;
}

/** Every locale's URL for a path, plus x-default on the default locale. */
export function localeAlternates(path: string): Record<string, string> {
  return {
    ...Object.fromEntries(routing.locales.map((l) => [l, localeUrl(l, path)])),
    "x-default": localeUrl(routing.defaultLocale, path),
  };
}

export type Portal = "talents" | "casting";

/**
 * Canonical + hreflang + Open Graph + Twitter for one public page.
 *
 * Every public page routes through here rather than composing metadata by
 * hand. That is the whole point: the site previously emitted no canonical, no
 * hreflang, no og: and no twitter: tag anywhere, and fixing that page by page
 * would let the omission return with the next page someone adds.
 *
 * `path` carries NO locale prefix — this builds all three from it.
 */
export function seo(opts: {
  locale: string;
  path: string;
  title: string;
  description: string;
  /** Set for article-style pages (the blog); defaults to a plain website. */
  type?: "website" | "article";
}): Metadata {
  const { locale, path, title, description } = opts;
  const url = localeUrl(locale, path);

  // The image is set explicitly rather than left to the opengraph-image file
  // convention. Measured, not assumed: with the card declared at [locale] and
  // every page setting `openGraph` through this helper, Next emitted no
  // og:image at all — an explicit openGraph object wins over the file
  // convention for that field. One card per locale, one deterministic URL.
  const image = `${SITE}/${locale}/opengraph-image`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: localeAlternates(path),
    },
    openGraph: {
      type: opts.type ?? "website",
      siteName: "Agental",
      locale,
      url,
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: "Agental" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

/**
 * Serialise JSON-LD for a <script type="application/ld+json"> tag.
 *
 * `<` is escaped because the payload is injected with
 * dangerouslySetInnerHTML: a string containing "</script>" would otherwise
 * close the tag early and turn structured data into an injection point.
 */
export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Organization node, emitted once from the locale layout. */
export function organizationLd(locale: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Agental",
    url: localeUrl(locale, "/"),
    logo: `${SITE}/icon.svg`,
    description:
      "Agence artistique régulée dont le travail opérationnel est augmenté par l'IA.",
  };
}

/** One FAQ entry as the pages store it. */
export interface FaqItem {
  q: string;
  a: string;
}

/**
 * FAQPage node. Built from the SAME message data the page renders, never from a
 * hand-maintained copy — structured data that disagrees with the visible page
 * is worse than none, and Google treats it as a reason to distrust the rest.
 */
export function faqPageLd(items: FaqItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };
}

/** Service node for a portal landing or a casting-type landing. */
export function serviceLd(opts: {
  locale: string;
  path: string;
  name: string;
  description: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: opts.name,
    description: opts.description,
    url: localeUrl(opts.locale, opts.path),
    provider: { "@type": "Organization", name: "Agental", url: SITE },
    areaServed: { "@type": "Country", name: "France" },
  };
}

/** Breadcrumb trail. `crumbs` are [label, path-without-locale] pairs. */
export function breadcrumbLd(
  locale: string,
  crumbs: Array<[string, string]>
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map(([name, path], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: localeUrl(locale, path),
    })),
  };
}
