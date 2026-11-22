/**
 * The staff-only admin site (admin.agental.co): same codebase and database as
 * www, reached by host. On that host only the admin pages and what they need
 * (sign-in and the account email flows) answer; everything else is 404, and
 * "/" goes to the admin hub. API routes are not routed by the proxy; each
 * admin route checks the role itself (currentAdminId).
 */
import { routing } from "@/i18n/routing";

export const ADMIN_HOSTS = ["admin.agental.co", "admin.localhost"] as const;

export function isAdminHost(host: string | null | undefined): boolean {
  const h = (host ?? "").split(":")[0].trim().toLowerCase();
  return (ADMIN_HOSTS as readonly string[]).includes(h);
}

export type AdminHostRoute = { kind: "redirect"; to: string } | { kind: "allow" } | { kind: "notfound" };

const LOCALE = `(?:${routing.locales.join("|")})`;
const ALLOWED = new RegExp(
  `^/${LOCALE}(?:/admin(?:/.*)?|/connexion|/mot-de-passe-oublie|/reinitialiser|/verifier)/?$`
);

export function adminHostRoute(pathname: string): AdminHostRoute {
  if (pathname === "/" || pathname === "") return { kind: "redirect", to: "/en/admin" };
  // Auth.js sends sign-in and errors to "/connexion" with no locale.
  if (/^\/connexion\/?$/.test(pathname)) return { kind: "redirect", to: "/en/connexion" };
  // After sign-in (Google, or no `next`), the app goes to /continuer: here, the hub.
  const cont = new RegExp(`^/(${LOCALE.slice(3, -1)})/continuer/?$`).exec(pathname);
  if (cont) return { kind: "redirect", to: `/${cont[1]}/admin` };
  const bare = new RegExp(`^/${LOCALE}/?$`).exec(pathname);
  if (bare) return { kind: "redirect", to: `${pathname.replace(/\/$/, "")}/admin` };
  return ALLOWED.test(pathname) ? { kind: "allow" } : { kind: "notfound" };
}
