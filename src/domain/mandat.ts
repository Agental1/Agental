import type { ErrorKey } from "./action-result";
import { isAdult } from "./age";
import { B2C_PLANS } from "./pricing";

/**
 * The representation agreement a performer can accept, by version.
 *
 * None is approved. Until counsel approves a text for the market the product
 * runs in, `approvedVersion` stays null: signMandat refuses, no Mandat row is
 * created, and no screen asks for acceptance. When a text is approved, set its
 * version here; an acceptance is then recorded against that exact version
 * (Mandat.documentVersion), with its date.
 *
 * Platform terms and privacy choices are separate and do not go through here.
 */
export const MANDATE: { approvedVersion: string | null } = {
  approvedVersion: null,
};

/**
 * The terms of the representation agreement that copy quotes (docs/LEGAL_COPY.md).
 * The base commission is read from the pricing table, never retyped; the term
 * and the notice period live here so no message file carries a figure.
 */
export const MANDATE_BASE_COMMISSION_RATE = B2C_PLANS.FREE.commissionRate;
export const MANDATE_TERM_MONTHS = 12;
export const MANDATE_NOTICE_DAYS = 60;

/**
 * The load-bearing separation between Mandat (free legal representation) and
 * Subscription (optional paid service). Opportunity access depends ONLY on an
 * active Mandat — never on a paid plan. This function must never read a
 * subscription. See schema.prisma header.
 */
export function canReceiveOpportunities(mandat: {
  status: string;
  signedAt: Date | null;
} | null): boolean {
  return !!mandat && mandat.status === "ACTIVE" && mandat.signedAt !== null;
}

/** A lapsed subscription downgrades features but NEVER revokes representation. */
export function isRepresented(mandat: { status: string } | null): boolean {
  return !!mandat && mandat.status === "ACTIVE";
}

/** What signMandat loads before it signs. */
export interface MandatSignState {
  stageName: string;
  birthDate: Date | null;
  isMinor: boolean;
  specialtiesCount: number;
  mandat: { status: string; signedAt: Date | null } | null;
}

/**
 * Why the mandate cannot be signed yet, as a translation key, or null when it
 * can. The wizard checks each step on its own, but the signature is the legal
 * act, so the server re-checks the whole profile here instead of trusting that
 * the earlier steps ran. A legacy profile flagged isMinor is refused even when
 * its stored birth date now says otherwise: that flag is the one the minors
 * workflow reads.
 */
export function mandatSignBlocker(
  state: MandatSignState | null,
  today: Date = new Date()
): ErrorKey | null {
  if (!state) return "errors.profileNotFound";
  if (canReceiveOpportunities(state.mandat)) return "errors.mandatAlreadySigned";
  if (state.stageName.trim().length < 2) return "errors.stageNameRequired";
  if (!state.birthDate) return "errors.birthDateRequired";
  if (state.isMinor || !isAdult(state.birthDate, today)) return "errors.adultsOnly";
  if (state.specialtiesCount < 1) return "errors.specialtyRequired";
  return null;
}
