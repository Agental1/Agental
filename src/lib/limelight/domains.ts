import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { LIMELIGHT } from "@/domain/limelight";
import {
  isSameOrSubdomain,
  limelightRootDomain,
  normalizeHostname,
  type HostEnv,
} from "./hostname";

/**
 * A customer's own domain on a Limelight site.
 *
 * The customer keeps the domain at their registrar and stays its owner: they
 * add two DNS records and can remove them at any time. Nothing here
 * registers, transfers or renews a domain, and nothing calls the hosting
 * provider. The steps:
 *
 * 1. PENDING: the domain is added and a TXT record is asked for.
 * 2. VERIFIED: the TXT record was found, so the person controls the domain.
 * 3. ACTIVE: an operator attached the domain in the hosting dashboard and
 *    confirmed it here. Only an ACTIVE domain serves a site.
 *
 * This is a plain module: the actions in src/app/actions/sites.ts decide who
 * may call what.
 */

/** The label of the TXT record that proves control of a domain. */
export const VERIFY_TXT_LABEL = "_agental-verify";
/** What the TXT record's value starts with. The token follows. */
export const VERIFY_TXT_PREFIX = "agental-site-verification=";
/** Custom domains per site. A storage bound, and a brake on name squatting. */
export const MAX_CUSTOM_DOMAINS_PER_SITE = 5;

const DNS_TIMEOUT_MS = 5000;

/**
 * Names nobody can own on the public internet (RFC 2606 and RFC 6761, plus
 * the usual private suffixes), and hosting hosts that are never a
 * customer's.
 */
const RESERVED_DOMAINS = [
  "localhost",
  "local",
  "localdomain",
  "internal",
  "intranet",
  "lan",
  "home",
  "corp",
  "test",
  "example",
  "invalid",
  "onion",
  "arpa",
  "example.com",
  "example.net",
  "example.org",
] as const;

/** The domains of the platform itself. A customer can never claim them. */
function ownDomains(env: HostEnv): string[] {
  const own = new Set<string>(["agental.co", LIMELIGHT.siteDomain]);
  const root = limelightRootDomain(env);
  if (root) own.add(root);
  for (const name of ["NEXT_PUBLIC_SITE_URL", "AUTH_URL"]) {
    try {
      const host = normalizeHostname(new URL((env[name] ?? "").trim()).hostname);
      if (host && host.includes(".")) own.add(host.replace(/^www\./, ""));
    } catch {
      // Unset or unreadable: nothing to add.
    }
  }
  for (const item of (env.LIMELIGHT_APP_HOSTS ?? "").split(",")) {
    const host = normalizeHostname(item);
    if (host && host.includes(".")) own.add(host);
  }
  return [...own];
}

/**
 * A hostname a customer may connect, in normal form, or null.
 *
 * It must be a public name: at least two labels, a last label of letters (or
 * a punycode one), not one of the platform's own domains or their
 * subdomains, and not a reserved name. See `normalizeHostname` for the
 * character rules.
 */
export function customHostname(raw: unknown, env: HostEnv = process.env): string | null {
  const host = normalizeHostname(raw);
  if (!host) return null;
  const labels = host.split(".");
  if (labels.length < 2) return null;
  const tld = labels[labels.length - 1];
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld)) return null;
  if (RESERVED_DOMAINS.some((name) => isSameOrSubdomain(host, name))) return null;
  if (ownDomains(env).some((name) => isSameOrSubdomain(host, name))) return null;
  // The verification record lives one label below; it must still fit.
  if (`${VERIFY_TXT_LABEL}.${host}`.length > 253) return null;
  return host;
}

/** 32 hexadecimal characters. It proves control of a domain; it opens nothing else. */
export function newVerificationToken(): string {
  return randomBytes(16).toString("hex");
}

export interface DomainDnsRecords {
  /** Name of the TXT record to create. */
  txtName: string;
  /** Its value. */
  txtValue: string;
  /** Where the domain's CNAME record points. */
  cnameTarget: string;
}

/**
 * The CNAME target shown to customers: `LIMELIGHT_CNAME_TARGET` when set
 * (the value the hosting dashboard gives), otherwise the root domain of the
 * hosted sites.
 */
export function cnameTarget(env: HostEnv = process.env): string {
  return (
    normalizeHostname(env.LIMELIGHT_CNAME_TARGET) ??
    limelightRootDomain(env) ??
    LIMELIGHT.siteDomain
  );
}

/** The two DNS records a customer adds for `hostname`. */
export function dnsRecordsFor(
  hostname: string,
  token: string,
  env: HostEnv = process.env
): DomainDnsRecords {
  return {
    txtName: `${VERIFY_TXT_LABEL}.${hostname}`,
    txtValue: `${VERIFY_TXT_PREFIX}${token}`,
    cnameTarget: cnameTarget(env),
  };
}

/** The part of `node:dns/promises` the check needs. Tests hand in a fake. */
export interface TxtResolver {
  resolveTxt(hostname: string): Promise<string[][]>;
}

async function systemResolver(): Promise<TxtResolver> {
  const dns = await import("node:dns/promises");
  return { resolveTxt: (hostname) => dns.resolveTxt(hostname) };
}

/**
 * True when the TXT record for `hostname` holds exactly the expected value.
 *
 * A TXT record arrives as chunks of up to 255 bytes; they are joined before
 * comparing. No record, a resolver error and a slow resolver (5 seconds) all
 * read as "not found": the caller tells the customer to try again later.
 */
export async function hasVerificationRecord(
  hostname: string,
  token: string,
  resolver?: TxtResolver
): Promise<boolean> {
  const expected = `${VERIFY_TXT_PREFIX}${token}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const dns = resolver ?? (await systemResolver());
    const records = await Promise.race([
      dns.resolveTxt(`${VERIFY_TXT_LABEL}.${hostname}`),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("DNS lookup timed out")), DNS_TIMEOUT_MS);
      }),
    ]);
    return records.some((chunks) => chunks.join("").trim() === expected);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type DomainDb = Pick<PrismaClient, "siteDomain">;

export interface SiteDomainView {
  id: string;
  hostname: string;
  kind: string;
  status: string;
  verifiedAt: Date | null;
  lastCheckedAt: Date | null;
  createdAt: Date;
  /** The records to show the customer. Null for the hosted subdomain. */
  dns: DomainDnsRecords | null;
}

/**
 * The domains of one site, the hosted subdomain first, then by age. It
 * checks nobody: load the site with `getSiteForOwner` or
 * `getSiteForOperator` first and call this only when that answered a site.
 */
export async function listSiteDomains(
  siteId: string,
  db: DomainDb = prisma
): Promise<SiteDomainView[]> {
  const rows = await db.siteDomain.findMany({
    where: { siteId },
    orderBy: [{ kind: "desc" }, { createdAt: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    hostname: row.hostname,
    kind: row.kind,
    status: row.status,
    verifiedAt: row.verifiedAt,
    lastCheckedAt: row.lastCheckedAt,
    createdAt: row.createdAt,
    dns:
      row.kind === "CUSTOM" ? dnsRecordsFor(row.hostname, row.verificationToken) : null,
  }));
}

export type DomainCheck =
  | { verified: true; status: "VERIFIED" | "ACTIVE" }
  | { verified: false };

/**
 * Look for the TXT record of a custom domain and record the outcome.
 *
 * `lastCheckedAt` moves on every look. On a match a PENDING (or FAILED)
 * domain becomes VERIFIED with `verifiedAt`. A domain that is already
 * VERIFIED or ACTIVE is answered as it stands, with no lookup: removing the
 * record later does not undo a verification.
 */
export async function checkDomainOwnership(
  domain: { id: string; hostname: string; status: string; verificationToken: string },
  opts: { resolver?: TxtResolver; now?: Date; db?: DomainDb } = {}
): Promise<DomainCheck> {
  if (domain.status === "VERIFIED" || domain.status === "ACTIVE") {
    return { verified: true, status: domain.status };
  }
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();
  const found = await hasVerificationRecord(
    domain.hostname,
    domain.verificationToken,
    opts.resolver
  );
  if (!found) {
    await db.siteDomain.updateMany({
      where: { id: domain.id },
      data: { lastCheckedAt: now },
    });
    return { verified: false };
  }
  // Only a domain that is still waiting moves: an operator may have
  // activated it between the read and this write.
  await db.siteDomain.updateMany({
    where: { id: domain.id, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "VERIFIED", verifiedAt: now, lastCheckedAt: now },
  });
  return { verified: true, status: "VERIFIED" };
}
