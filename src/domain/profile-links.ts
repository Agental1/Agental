import { z } from "zod";

/**
 * The two optional links on a profile. Both are stored as full https URLs.
 * A bare "imdb.com/name/nm123" is accepted and completed; an empty string
 * clears the link.
 */

function withScheme(raw: string): string {
  const v = raw.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
}

/** imdb.com/name/nm1234567, with or without www or m, scheme optional. */
const IMDB_HOST = /^(www\.|m\.)?imdb\.com$/i;

export function normalizeImdbUrl(raw: string): string | null {
  try {
    const u = new URL(withScheme(raw));
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!IMDB_HOST.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/name\/(nm\d{5,10})\/?/i);
    if (!m) return null;
    return `https://www.imdb.com/name/${m[1].toLowerCase()}/`;
  } catch {
    return null;
  }
}

/** Any https URL. Plain http is refused. */
export function normalizePortfolioUrl(raw: string): string | null {
  try {
    const v = raw.trim();
    if (/^http:\/\//i.test(v)) return null;
    const u = new URL(withScheme(v));
    if (u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const ProfileLinks = z.object({
  imdbUrl: z.preprocess(
    emptyToNull,
    z
      .string()
      .max(300)
      .transform((v, ctx) => {
        const n = normalizeImdbUrl(v);
        if (!n) ctx.addIssue({ code: "custom", message: "errors.imdbUrl" });
        return n as string;
      })
      .nullable()
  ),
  portfolioUrl: z.preprocess(
    emptyToNull,
    z
      .string()
      .max(300)
      .transform((v, ctx) => {
        const n = normalizePortfolioUrl(v);
        if (!n) ctx.addIssue({ code: "custom", message: "errors.portfolioUrl" });
        return n as string;
      })
      .nullable()
  ),
});
export type ProfileLinks = z.infer<typeof ProfileLinks>;
