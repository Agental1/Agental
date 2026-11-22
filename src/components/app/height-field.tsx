"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  HEIGHT_MAX_CM,
  HEIGHT_MAX_FEET,
  HEIGHT_MIN_CM,
  HEIGHT_MIN_FEET,
  fieldsFromValue,
  heightFromFields,
  initialHeightUnit,
  switchHeightUnit,
  type HeightFields,
  type HeightUnit,
  type HeightValue,
} from "@/domain/height";

const FEET = Array.from(
  { length: HEIGHT_MAX_FEET - HEIGHT_MIN_FEET + 1 },
  (_, i) => HEIGHT_MIN_FEET + i
);
const INCHES = Array.from({ length: 12 }, (_, i) => i);

const selectClass = cn(
  "flex h-11 w-full rounded-sedan border border-field bg-surface px-3 py-2 text-fg",
  "text-base sm:h-10 sm:text-sm shadow-sm transition-colors",
  "focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/40"
);

/**
 * Height in feet and inches or in centimeters, with a unit toggle. English
 * starts on feet and inches, the other locales on centimeters.
 *
 * It reports `undefined` while nothing is entered, never 0: the server schema
 * reads a missing height as "not given", whereas a coerced blank used to fail
 * the range check. It reports what the talent types and nothing else, so an
 * untouched stored height is saved back exactly instead of being rounded
 * through inches. The unit toggle changes the view and keeps the value
 * (switchHeightUnit), apart from dropping an entry the other unit cannot show.
 *
 * `defaultValue` is read on mount only. Pass the value the field last
 * reported, which is the one that will be saved: a wizard step or a hidden tab
 * unmounts the field, and it has to open again on that value.
 */
export function HeightField({
  label,
  defaultValue,
  onChange,
  hideLabel = false,
}: {
  label: string;
  defaultValue?: HeightValue;
  onChange: (value: HeightValue | undefined) => void;
  /** Round 8 Physical tiles: the tile already shows the label. */
  hideLabel?: boolean;
}) {
  const t = useTranslations("app");
  const locale = useLocale();
  const id = useId();
  const [unit, setUnit] = useState<HeightUnit>(() =>
    initialHeightUnit(defaultValue, locale)
  );
  const [fields, setFields] = useState<HeightFields>(() =>
    fieldsFromValue(defaultValue)
  );
  // Whether the shown unit's text changed since both units last agreed.
  const [edited, setEdited] = useState(false);

  const unitLabel = (u: "foot" | "inch", n: number) =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit: u,
      unitDisplay: "short",
    }).format(n);

  function edit(next: HeightFields) {
    setFields(next);
    setEdited(true);
    onChange(heightFromFields(unit, next));
  }

  function switchUnit(nextUnit: HeightUnit) {
    if (nextUnit === unit) return;
    const next = switchHeightUnit(unit, fields, edited);
    setUnit(nextUnit);
    setFields(next.fields);
    setEdited(false);
    if (next.cleared) onChange(undefined);
  }

  return (
    <fieldset className="space-y-1.5">
      {/* A legend must be the fieldset's first child to name it, so the
          visible label next to the toggle is a plain span. */}
      <legend className="sr-only">{label}</legend>
      <div className={cn("flex items-center gap-2", hideLabel ? "justify-end" : "justify-between")}>
        {!hideLabel && (
          <span aria-hidden className="text-sm font-medium leading-none text-fg">
            {label}
          </span>
        )}
        <div
          role="group"
          aria-label={t("height.unit")}
          className="inline-flex rounded-sedan bg-surface-2 p-0.5 text-xs"
        >
          {(["imperial", "metric"] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              onClick={() => switchUnit(u)}
              className={cn(
                "min-h-6 rounded-sedan px-2.5 py-1 transition-colors",
                unit === u ? "bg-surface font-medium text-fg shadow-sm" : "text-fg-muted"
              )}
            >
              {t(`height.${u}`)}
            </button>
          ))}
        </div>
      </div>
      {unit === "imperial" ? (
        <div className="grid grid-cols-2 gap-2">
          <select
            id={`${id}-ft`}
            aria-label={t("height.feet")}
            className={selectClass}
            value={fields.feet}
            onChange={(e) => edit({ ...fields, feet: e.target.value })}
          >
            <option value="">{t("height.feet")}</option>
            {FEET.map((n) => (
              <option key={n} value={String(n)}>
                {unitLabel("foot", n)}
              </option>
            ))}
          </select>
          <select
            id={`${id}-in`}
            aria-label={t("height.inches")}
            className={selectClass}
            value={fields.inches}
            onChange={(e) => edit({ ...fields, inches: e.target.value })}
          >
            <option value="">{t("height.inches")}</option>
            {INCHES.map((n) => (
              <option key={n} value={String(n)}>
                {unitLabel("inch", n)}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <Input
          id={`${id}-cm`}
          type="number"
          inputMode="numeric"
          min={HEIGHT_MIN_CM}
          max={HEIGHT_MAX_CM}
          aria-label={t("height.centimeters")}
          placeholder={t("height.centimeters")}
          value={fields.cm}
          onChange={(e) => edit({ ...fields, cm: e.target.value })}
        />
      )}
    </fieldset>
  );
}
