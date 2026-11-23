/**
 * Round 10, group 4 (founder): one simple account model, the same on every
 * admin page (definitions in docs/DECISIONS.md).
 *
 *   Type     Performer, Casting or Staff. Staff: the founders' and the team's
 *            accounts (isStaff, an admin, or the old STAFF status), whatever
 *            their kind; otherwise the kind they signed up as.
 *   Test     a separate on/off flag (accountStatus TEST), shown as a badge,
 *            never a type. A Test account can search in test mode, Staff too.
 *   Deleted  accounts in the 30-day "Deleted" list, counted nowhere else.
 */
export const ACCOUNT_TYPES = ["PERFORMER", "CASTING", "STAFF"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export interface AccountModelFacts {
  kind: string;
  isStaff: boolean;
  isAdmin: boolean;
  accountStatus: string;
}

export function accountType(u: AccountModelFacts): AccountType {
  if (u.isStaff || u.isAdmin || u.accountStatus === "STAFF") return "STAFF";
  return u.kind === "CASTING" ? "CASTING" : "PERFORMER";
}

export function isTestAccount(u: Pick<AccountModelFacts, "accountStatus">): boolean {
  return u.accountStatus === "TEST";
}

/**
 * The status the search gate reads: the Test flag first (a Staff account
 * marked Test searches like any Test account), then Staff (never searches),
 * then the stored status.
 */
export function effectiveStatus(u: AccountModelFacts): string {
  if (u.accountStatus === "TEST") return "TEST";
  if (accountType(u) === "STAFF") return "STAFF";
  return u.accountStatus;
}
