import { prisma } from "@/lib/db";
import { CONSENT_CHOICES, consentChoiceOf, type ConsentChoice } from "@/domain/consent-choice";
import { accountType, isTestAccount, type AccountType } from "@/domain/account-model";

/**
 * Round 10, group 4: who accepted the cookies. Signed-in accounts: their
 * choice, its date and the policy version, from the account row (recorded
 * since round 7b). Visitors without an account: weekly totals by choice only
 * (ConsentTally, recorded since round 10; before that their choice lived only
 * in their own browser). Server only; every caller checks currentAdminId().
 */

export interface CookieFilters {
  choice?: ConsentChoice;
  version?: string;
  /** YYYY-MM-DD, on the date of the choice. */
  from?: string;
  to?: string;
}

const isDay = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : undefined);

export function cookieFiltersFrom(get: (k: string) => string | null | undefined): CookieFilters {
  const choice = get("choice") || undefined;
  return {
    choice: (CONSENT_CHOICES as readonly string[]).includes(choice ?? "") ? (choice as ConsentChoice) : undefined,
    version: get("version")?.slice(0, 20) || undefined,
    from: isDay(get("from") || undefined),
    to: isDay(get("to") || undefined),
  };
}

export interface CookieRow {
  id: string;
  email: string;
  type: AccountType;
  isTest: boolean;
  choice: ConsentChoice;
  analytics: boolean | null;
  marketing: boolean | null;
  at: Date | null;
  version: string | null;
}

export async function listCookieChoices(f: CookieFilters = {}): Promise<CookieRow[]> {
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      ...(f.version ? { consentVersion: f.version } : {}),
      ...(f.from || f.to
        ? {
            consentAt: {
              ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}),
              ...(f.to ? { lt: new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86_400_000) } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ consentAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 10000,
    select: {
      id: true,
      email: true,
      kind: true,
      isStaff: true,
      isAdmin: true,
      accountStatus: true,
      consentAnalytics: true,
      consentMarketing: true,
      consentAt: true,
      consentVersion: true,
    },
  });
  return users
    .map((u) => ({
      id: u.id,
      email: u.email,
      type: accountType(u),
      isTest: isTestAccount(u),
      choice: consentChoiceOf(u),
      analytics: u.consentAnalytics,
      marketing: u.consentMarketing,
      at: u.consentAt,
      version: u.consentVersion,
    }))
    .filter((r) => !f.choice || r.choice === f.choice);
}

export function cookieTotals(rows: CookieRow[]): Record<ConsentChoice, number> {
  const t = { accepted_all: 0, rejected: 0, custom: 0, none: 0 };
  for (const r of rows) t[r.choice] += 1;
  return t;
}

/** Visitors without an account: totals by week and choice, newest week first. */
export async function visitorTallies(weeks = 12): Promise<{ weekStart: Date; counts: Record<ConsentChoice, number> }[]> {
  const rows = await prisma.consentTally.findMany({ orderBy: { weekStart: "desc" }, take: weeks * 4 });
  const byWeek = new Map<number, Record<ConsentChoice, number>>();
  for (const r of rows) {
    const key = r.weekStart.getTime();
    const c = byWeek.get(key) ?? { accepted_all: 0, rejected: 0, custom: 0, none: 0 };
    if ((CONSENT_CHOICES as readonly string[]).includes(r.choice)) c[r.choice as ConsentChoice] += r.count;
    byWeek.set(key, c);
  }
  return [...byWeek.entries()].slice(0, weeks).map(([k, counts]) => ({ weekStart: new Date(k), counts }));
}

/** RFC 4180 CSV, formula-looking cells neutralized. */
export function cookiesCsv(rows: CookieRow[]): string {
  const cell = (v: unknown) => {
    let s = v instanceof Date ? v.toISOString() : String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["id", "email", "type", "test", "choice", "analytics", "marketing", "chosen_at", "policy_version"];
  const lines = rows.map((r) => [r.id, r.email, r.type, r.isTest, r.choice, r.analytics ?? "", r.marketing ?? "", r.at ?? "", r.version ?? ""].map(cell).join(","));
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}
