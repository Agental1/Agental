"use client";

import { createContext, useContext } from "react";
import { useTranslations } from "next-intl";

/**
 * Round 10: the profile editor marks each required field that is still empty
 * (red border and "Required"). The set holds the `data-field` names of those
 * fields (ITEM_TARGET in src/domain/profile-tabs.ts), from the server's list.
 */
export const MissingFieldsContext = createContext<ReadonlySet<string>>(new Set());

export function useMissingField(field: string | undefined): boolean {
  const missing = useContext(MissingFieldsContext);
  return !!field && missing.has(field);
}

/** The red outline around a group of choices (chips, a slider, a section). */
export const MISSING_BOX = "rounded-sedan outline outline-2 outline-offset-4 outline-danger";

/** "Required", in red, under a field that is still empty. */
export function RequiredNote() {
  const t = useTranslations("talents.space.profileEditor");
  return <p className="text-xs font-bold text-danger">{t("missingRequired")}</p>;
}
