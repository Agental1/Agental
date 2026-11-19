import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { getToken } from "next-auth/jwt";
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
const negotiateLocale = createMiddleware(routing);

/**
 * The three public entry points a signed-in visitor should never land on: the
 * home page and the two audience pages. They are sent to /[locale]/continuer,
 * which picks their dashboard or their unfinished onboarding. Every other
 * public page (pricing, FAQ, Limelight...) stays readable while signed in.
 *
 * The check lives here so those pages stay static. The session token is
 * verified (signature and expiry), so a stale cookie cannot trap a signed-out
 * visitor in a redirect.
 */
const SIGNED_IN_REDIRECT = new RegExp(
  `^/(${routing.locales.join("|")})(?:/(?:talents|casting))?/?$`
);

export default async function proxy(req: NextRequest) {
  const entry = req.nextUrl.pathname.match(SIGNED_IN_REDIRECT);
  if (entry && process.env.AUTH_SECRET) {
    const token = await getToken({
      req,
      secret: process.env.AUTH_SECRET,
      secureCookie: req.nextUrl.protocol === "https:",
    }).catch(() => null);
    if (token) {
      return NextResponse.redirect(new URL(`/${entry[1]}/continuer`, req.url));
    }
  }
  return negotiateLocale(req);
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
