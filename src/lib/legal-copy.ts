/**
 * ICU params for the shared `common.legalCopy.*` messages (docs/LEGAL_COPY.md).
 * Every figure comes from code: the base commission from the pricing table via
 * `src/domain/mandat.ts`, the term and the notice period from the same file.
 */
import { MANDATE_BASE_COMMISSION_RATE, MANDATE_NOTICE_DAYS, MANDATE_TERM_MONTHS } from "@/domain/mandat";
import { percent } from "@/lib/format";

export function legalCopyParams(locale: string) {
  return {
    commission: percent(MANDATE_BASE_COMMISSION_RATE, locale),
    months: MANDATE_TERM_MONTHS,
    noticeDays: MANDATE_NOTICE_DAYS,
  };
}
