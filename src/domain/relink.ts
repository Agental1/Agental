/**
 * Round 8 linked free-text cities and phone numbers to the pickers; a few could
 * not be linked automatically (6 cities and 1 number on production). Those
 * people see a short prompt on their profile until they pick their city from
 * the list or fix their number (round 8c).
 */
export function relinkNeeds(p: {
  city: string | null;
  cityGeonameId: number | null;
  phone: string | null;
  phoneE164: string | null;
}): { city: boolean; phone: boolean } {
  return {
    city: !!p.city?.trim() && p.cityGeonameId == null,
    phone: !!p.phone?.trim() && !p.phoneE164,
  };
}
