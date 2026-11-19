/**
 * Hostnames for Limelight sites: one normal form, and the rule that tells a
 * site's host from the app's own hosts.
 *
 * This module is pure (no database, no Node API) so the proxy can import it.
 * The lookups live in ./hosts.ts and ./domains.ts.
 */

export type HostEnv = Record<string, string | undefined>;

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PORT = /:\d{1,5}$/;
const MAX_HOSTNAME_LENGTH = 253;

/**
 * The normal form of a hostname, or null when the value is not a plain one.
 *
 * Lowercased, with a port and a trailing dot removed. What remains must be
 * dot-separated labels of ASCII letters, digits and hyphens (a hyphen never
 * first or last), 63 characters per label and 253 in total. Refused: an empty
 * value, an IP address in either family, a URL, a path, user info, a
 * wildcard, an underscore, white space and any non-ASCII character
 * (international names arrive in their "xn--" form).
 *
 * A `Host` header is typed by the client, so nothing is looked up before it
 * went through here.
 */
export function normalizeHostname(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let host = raw.trim().toLowerCase();
  if (host.length === 0 || host.length > MAX_HOSTNAME_LENGTH + 8) return null;
  host = host.replace(PORT, "");
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host.length === 0 || host.length > MAX_HOSTNAME_LENGTH) return null;

  const labels = host.split(".");
  if (!labels.every((label) => LABEL.test(label))) return null;
  // An all-digit last label is an IPv4 address, never a name.
  if (/^\d+$/.test(labels[labels.length - 1])) return null;
  return host;
}

/** True when `host` is `domain` or one of its subdomains. Both normalized. */
export function isSameOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** `LIMELIGHT_ROOT_DOMAIN` in normal form. Null when unset or unreadable. */
export function limelightRootDomain(env: HostEnv = process.env): string | null {
  const root = normalizeHostname(env.LIMELIGHT_ROOT_DOMAIN);
  return root && root.includes(".") ? root : null;
}

/** The public hostname of a hosted subdomain. Null while no root domain is set. */
export function subdomainHostname(
  subdomain: string,
  env: HostEnv = process.env
): string | null {
  const root = limelightRootDomain(env);
  return root ? normalizeHostname(`${subdomain}.${root}`) : null;
}

/** A comma-separated variable as normalized hostnames; unreadable items are dropped. */
function hostList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => normalizeHostname(item))
    .filter((item): item is string => item !== null);
}

/**
 * For the proxy: the hostname to serve as a Limelight site, or null when the
 * request belongs to the app.
 *
 * - `LIMELIGHT_ROOT_DOMAIN` unset: always null. Site routing is off.
 * - A subdomain of the root domain: that hostname. The root domain itself is
 *   not a site.
 * - Any other host is a customer's own domain only when it is absent from
 *   `LIMELIGHT_APP_HOSTS`, a comma-separated list of the app's hosts (each
 *   entry also covers its subdomains). While that variable is unset, custom
 *   domains are not routed: guessing which hosts are the app's would send
 *   app traffic to the site renderer on a host nobody listed.
 *
 * This only classifies the host. Whether a site is published there is
 * `resolveSiteByHost`'s answer.
 */
export function limelightSiteHost(
  hostHeader: unknown,
  env: HostEnv = process.env
): string | null {
  const root = limelightRootDomain(env);
  if (!root) return null;
  const host = normalizeHostname(hostHeader);
  if (!host || host === root) return null;
  if (host.endsWith(`.${root}`)) return host;

  const appHosts = hostList(env.LIMELIGHT_APP_HOSTS);
  if (appHosts.length === 0) return null;
  if (appHosts.some((appHost) => isSameOrSubdomain(host, appHost))) return null;
  return host;
}
