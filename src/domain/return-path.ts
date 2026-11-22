import { routing } from "@/i18n/routing";

/**
 * Where sign-in may send someone back to. Only pages inside the two apps or the
 * admin area (whose own layout checks the role), on
 * this site, with at most `?restore=1`: anything else (another host, a
 * protocol-relative "//", an encoded path, a public page) is refused, so the
 * parameter can never become an open redirect.
 */
const RETURN_PATH = new RegExp(
  `^/(${routing.locales.join("|")})/(?:(?:talents|casting)/app|admin)(?:/[a-z0-9-]+){0,3}/?(?:\\?restore=1)?$`
);

export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 200) return null;
  return RETURN_PATH.test(raw) ? raw : null;
}
