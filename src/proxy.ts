import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

/**
 * Locale negotiation. Named `proxy.ts`, not `middleware.ts`: Next 16 deprecated
 * the middleware file convention and renamed it (see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
 * The next-intl import path is unrelated and keeps its own name.
 *
 * This is the ONLY place locale is resolved for an incoming request. It reads
 * the NEXT_LOCALE cookie and Accept-Language, then redirects an unprefixed path
 * to the visitor's locale. Static redirects in next.config.ts would run before
 * this (Next resolves redirects at step 2, proxy at step 3) and would strip that
 * negotiation, so there are none.
 */
const intl = createMiddleware(routing);

/**
 * The site used to serve /fr, /en and /es. French and Spanish are gone
 * (decision log D2), but those URLs are indexed and shared, so they get a
 * permanent redirect to the unprefixed English page instead of a 404.
 * next-intl already handles /en/* itself.
 */
const LEGACY_PREFIX = /^\/(fr|es)(?=\/|$)/;

export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (LEGACY_PREFIX.test(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(LEGACY_PREFIX, "") || "/";
    url.search = search;
    return NextResponse.redirect(url, 308);
  }
  return intl(request);
}

export const config = {
  /**
   * Everything except API routes, Next internals, and files with an extension.
   *
   * `icon` and `apple-icon` need naming explicitly: they are metadata routes
   * with no file extension, so the extension rule does not catch them and this
   * proxy was redirecting /icon to /fr/icon — which does not exist. The
   * manifest points at both, so "Add to home screen" got a redirect instead of
   * an image. Same shape as the /studio problem: any extensionless route that
   * lives outside [locale] has to be excluded here or it is unreachable.
   */
  matcher: ["/((?!api|_next|_vercel|icon|apple-icon|studio(?:/|$)|.*\\..*).*)"],
};
