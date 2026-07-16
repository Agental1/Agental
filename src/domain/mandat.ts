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
