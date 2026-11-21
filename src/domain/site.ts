import { z } from "zod";

/**
 * Limelight sites: what a performer can put on their website, and the rules
 * for the address it is published at.
 *
 * `Site.content` is a JSON string column; `SiteContent` is its contract. The
 * same schema validates what the editor sends and what is read back from the
 * database, so a row written by an older version still parses or is refused
 * in one place.
 */

/**
 * Template ids. They mirror the six looks shown on the Limelight page
 * (`talents.limelight.templates.items` in the message files): Marquee,
 * Contact sheet, Reel first, Stage door, Voice booth, Studio. The display
 * names stay in the message files; these ids are what the database stores.
 */
export const SITE_TEMPLATES = [
  "marquee",
  "contact-sheet",
  "reel-first",
  "stage-door",
  "voice-booth",
  "studio",
] as const;

export const SiteTemplate = z.enum(SITE_TEMPLATES);
export type SiteTemplate = z.infer<typeof SiteTemplate>;

/** Mirrors of the String columns on Site, SiteOrder and StudentPriceRequest. */
export const SiteStatus = z.enum(["DRAFT", "PUBLISHED"]);
export type SiteStatus = z.infer<typeof SiteStatus>;

export const SiteOrderStatus = z.enum(["PENDING", "PAID", "CANCELED", "REFUNDED"]);
export type SiteOrderStatus = z.infer<typeof SiteOrderStatus>;

export const StudentPriceStatus = z.enum(["PENDING", "APPROVED", "REJECTED", "USED"]);
export type StudentPriceStatus = z.infer<typeof StudentPriceStatus>;

/** Mirrors of the String columns on SiteDomain. FAILED is not set by any code yet. */
export const SiteDomainKind = z.enum(["SUBDOMAIN", "CUSTOM"]);
export type SiteDomainKind = z.infer<typeof SiteDomainKind>;

export const SiteDomainStatus = z.enum(["PENDING", "VERIFIED", "ACTIVE", "FAILED"]);
export type SiteDomainStatus = z.infer<typeof SiteDomainStatus>;

/** A performer may keep this many sites, drafts included. */
export const MAX_SITES_PER_USER = 3;

/** Longest link a site may carry. Not a product rule, a storage bound. */
const MAX_URL_LENGTH = 500;

/**
 * True when the text holds a control character (U+0000 to U+001F, U+007F) or
 * a Unicode line or paragraph separator. With `allowBreaks`, tab, line feed
 * and carriage return pass: a bio has paragraphs, a name does not.
 *
 * Written as a loop over character codes: a regular expression for the same
 * set needs control characters in its source.
 */
export function hasControlChars(value: string, allowBreaks = false): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0x2028 || code === 0x2029) {
      if (!allowBreaks) return true;
      continue;
    }
    if (code >= 0x20 && code !== 0x7f) continue;
    if (allowBreaks && (code === 0x09 || code === 0x0a || code === 0x0d)) continue;
    return true;
  }
  return false;
}

/**
 * A web address that is safe to render as a link on a public page.
 *
 * Only https passes, or http as well with `allowHttp`. Every other scheme is
 * refused (javascript:, data:, mailto:, tel:, file:), and so are bare hosts
 * such as "localhost", IP addresses, and the "https://imdb.com@elsewhere.example" form,
 * where the part before the @ is a user name and the real host comes after
 * it. A backslash or a control character is refused too: browsers read
 * "https:\\host" and "ht\ttps://host" one way and other programs another,
 * and no address a person pastes needs either.
 */
export function isWebUrl(
  value: string,
  opts: { allowHttp?: boolean } = {}
): boolean {
  if (value.includes("\\") || hasControlChars(value)) return false;
  try {
    const url = new URL(value);
    const schemeOk =
      url.protocol === "https:" ||
      (opts.allowHttp === true && url.protocol === "http:");
    const host = url.hostname;
    return (
      schemeOk &&
      host.includes(".") &&
      // A name, never an address: "[::ffff:1.2.3.4]" and "127.0.0.1" (which
      // is also what the parser makes of "0x7f.1") are refused.
      !host.startsWith("[") &&
      !/^\d+$/.test(host.slice(host.lastIndexOf(".") + 1)) &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

/** Site links are https only. */
function isHttpsUrl(value: string): boolean {
  return isWebUrl(value);
}

/** An empty form field ("" or null) means the value is absent. */
function blankToUndefined(value: unknown): unknown {
  if (value == null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

/** One line of text: trimmed, capped, no control characters. */
function line(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .refine((value) => !hasControlChars(value));
}

const SiteLink = z.object({
  label: line(40),
  url: z.string().trim().max(MAX_URL_LENGTH).refine(isHttpsUrl),
});

const SiteCredit = z.object({
  title: line(120),
  role: line(80),
  year: z.preprocess(
    blankToUndefined,
    z.number().int().min(1900).max(2100).optional()
  ),
});

/**
 * Everything the performer writes on the site. Strings are trimmed and
 * unknown keys are dropped (the Zod default for objects). Only `name` is
 * required, so a draft can be saved long before it is complete.
 *
 * Output safety, since all of it ends on a public page:
 * - every text field has a length cap, and single-line fields refuse control
 *   characters (the bio keeps tabs and line breaks);
 * - the only addresses are `links[].url` (https only, see `isWebUrl`) and
 *   `contactEmail` (a plain email address, which a template may turn into a
 *   mailto: link). No field accepts tel:, mailto: or any other scheme as
 *   typed text;
 * - nothing here is HTML. Templates render every value as text.
 *
 * `mediaIds` point at the performer's own Media rows. This schema only bounds
 * their number; the saveSite action checks who owns them.
 *
 * Adding a field: add it here with a cap, give it a default or make it
 * optional so stored rows still parse, add it to `SITE_CONTACT_FIELDS` when
 * it is a way to reach the performer, and cover it in
 * tests/domain/site.test.ts.
 */
export const SiteContent = z.object({
  name: line(80).min(1),
  headline: line(140).default(""),
  bio: z
    .string()
    .trim()
    .max(2000)
    .refine((value) => !hasControlChars(value, true))
    .default(""),
  links: z.array(SiteLink).max(8).default([]),
  credits: z.array(SiteCredit).max(30).default([]),
  contactEmail: z.preprocess(
    blankToUndefined,
    z.string().trim().max(200).pipe(z.email()).optional()
  ),
  mediaIds: z.array(z.string().trim().min(1).max(64)).max(12).default([]),
});
export type SiteContent = z.infer<typeof SiteContent>;

/**
 * The fields that are a way to reach the performer. The public site shows
 * them only when the owner turned `Site.showContact` on.
 */
export const SITE_CONTACT_FIELDS = ["contactEmail"] as const;

/** The content as the public sees it when contact details are hidden. */
export function withoutContactFields(content: SiteContent): SiteContent {
  const copy: SiteContent = { ...content };
  for (const field of SITE_CONTACT_FIELDS) delete copy[field];
  return copy;
}

/**
 * What the site editor sends. Without `siteId` a new draft is created.
 *
 * `ownerId` is for operators only: the account a new site is assembled for.
 * The saveSite action ignores it unless the session belongs to an admin.
 */
export const SiteInput = z.object({
  siteId: z.string().trim().min(1).max(64).optional(),
  ownerId: z.preprocess(
    blankToUndefined,
    z.string().trim().min(1).max(64).optional()
  ),
  template: SiteTemplate,
  content: SiteContent,
});
export type SiteInput = z.infer<typeof SiteInput>;

/** Read the `Site.content` column. Null when the stored value does not parse. */
export function parseSiteContent(raw: string | null): SiteContent | null {
  try {
    const parsed = SiteContent.safeParse(JSON.parse(raw ?? "{}"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- subdomains

export const SUBDOMAIN_MIN_LENGTH = 3;
export const SUBDOMAIN_MAX_LENGTH = 40;

/**
 * Names a performer's site may never take: hosts the platform uses or may
 * use, mail and DNS names, and words that would pass for an official page.
 */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  // Platform hosts and environments.
  "www",
  "app",
  "api",
  "admin",
  "agental",
  "limelight",
  "staging",
  "preview",
  "dev",
  "test",
  "demo",
  "beta",
  "internal",
  "dashboard",
  "status",
  // Mail and DNS.
  "mail",
  "email",
  "smtp",
  "imap",
  "pop",
  "ftp",
  "ns1",
  "ns2",
  "autoconfig",
  "autodiscover",
  "postmaster",
  "hostmaster",
  "webmaster",
  "abuse",
  "noreply",
  "no-reply",
  // Static content.
  "cdn",
  "static",
  "assets",
  "media",
  "files",
  "images",
  // Words that read as an official page.
  "login",
  "signin",
  "signup",
  "auth",
  "account",
  "accounts",
  "billing",
  "checkout",
  "payment",
  "payments",
  "security",
  "support",
  "help",
  "docs",
  "blog",
  "legal",
  "privacy",
  "terms",
  "root",
  "system",
  "talents",
  "casting",
  "castings",
  "site",
  "sites",
]);

/** Latin letters that Unicode decomposition leaves whole. */
const LATIN_FOLDS: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
  ı: "i",
};

function trimHyphens(value: string): string {
  return value.replace(/^-+|-+$/g, "");
}

/**
 * Turn a performer's name into a subdomain label: lowercase ASCII letters,
 * digits and single hyphens, 3 to 40 characters, no hyphen at either end.
 * Accents are removed ("Chloé Müller" gives "chloe-muller"); anything else
 * becomes a hyphen. Returns null when nothing usable remains (a name in a
 * non-Latin script, a name of one or two letters) or when the result is
 * reserved.
 */
export function slugifySubdomain(name: string): string | null {
  const ascii = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ßæœøłđðþı]/g, (letter) => LATIN_FOLDS[letter] ?? "");
  const slug = trimHyphens(
    trimHyphens(ascii.replace(/[^a-z0-9]+/g, "-")).slice(0, SUBDOMAIN_MAX_LENGTH)
  );
  if (slug.length < SUBDOMAIN_MIN_LENGTH) return null;
  if (RESERVED_SUBDOMAINS.has(slug)) return null;
  return slug;
}

/**
 * The nth name to try for a base slug: the base itself, then "base-2",
 * "base-3" and so on. The base is shortened when the suffix would push the
 * result past 40 characters.
 */
export function subdomainCandidate(base: string, n: number): string {
  if (n <= 1) return base;
  const suffix = `-${n}`;
  const head = trimHyphens(base.slice(0, SUBDOMAIN_MAX_LENGTH - suffix.length));
  return `${head}${suffix}`;
}
