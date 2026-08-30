import createMiddleware from "next-intl/middleware";
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
export default createMiddleware(routing);

export const config = {
  // Everything except API routes, Next internals, and files with an extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
