/**
 * The staff-only admin site (admin.agental.co): same codebase and database as
 * www, reached by host. On that host only the admin pages and what they need
 * (sign-in and the account email flows) answer; everything else is 404, and
 * "/" goes to the admin hub. API routes are not routed by the proxy; each
 * admin route checks the role itself (currentAdminId).
 */
export const ADMIN_HOSTS = ["admin.agental.co", "admin.localhost"] as const;

export function isAdminHost(host: string | null | undefined): boolean {
  const h = (host ?? "").split(":")[0].trim().toLowerCase();
  return (ADMIN_HOSTS as readonly string[]).includes(h);
}

export type AdminHostRoute = { kind: "redirect"; to: string } | { kind: "allow" } | { kind: "notfound" };

const LOCALE = "(?:en|fr|es|zh)";
const ALLOWED = new RegExp(
  `^/${LOCALE}(?:/admin(?:/.*)?|/connexion|/mot-de-passe-oublie|/reinitialiser|/verifier)/?$`
);

export function adminHostRoute(pathname: string): AdminHostRoute {
  if (pathname === "/" || pathname === "") return { kind: "redirect", to: "/en/admin" };
  const bare = new RegExp(`^/${LOCALE}/?$`).exec(pathname);
  if (bare) return { kind: "redirect", to: `${pathname.replace(/\/$/, "")}/admin` };
  return ALLOWED.test(pathname) ? { kind: "allow" } : { kind: "notfound" };
}
