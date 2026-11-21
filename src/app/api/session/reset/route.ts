import { signOut } from "@/auth";
import { toLocale } from "@/i18n/routing";

/**
 * Clear a session cookie that no longer opens a session.
 *
 * A session can end on the server while its cookie lives on: the account was
 * deleted, or its sessions were cut off when a provider sign-in took it over
 * (User.sessionsValidAfter). The cookie still decodes, so anything that only
 * decodes it (the proxy sends visitors with a session cookie to /continuer)
 * keeps treating the visitor as signed in, while auth() says they are not.
 * A server component cannot delete a cookie; a route handler can, and
 * /continuer redirects here when it sees that mismatch.
 *
 * GET on purpose: it is reached by redirect. Clearing a session cookie is
 * harmless to request cross-site, and the visitor ends on the sign-in page.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const locale = toLocale(url.searchParams.get("locale") ?? "");
  await signOut({ redirect: false });
  return Response.redirect(new URL(`/${locale}/connexion`, url.origin), 303);
}
