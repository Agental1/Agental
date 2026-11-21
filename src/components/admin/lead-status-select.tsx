"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { setLeadStatus } from "@/app/actions/limelight";
import { ActionErrorMessage } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";
import { LIMELIGHT_LEAD_STATUSES, type LimelightLeadStatus } from "@/domain/limelight";

function isStatus(value: string): value is LimelightLeadStatus {
  return (LIMELIGHT_LEAD_STATUSES as readonly string[]).includes(value);
}

/**
 * Moves one Limelight request to New, Contacted or Closed (admins only,
 * audited). The page keys it by the stored status, so a refresh that brings
 * a new status starts it over.
 */
export function LeadStatusSelect({
  leadId,
  status,
  label,
}: {
  leadId: string;
  status: string;
  /** Accessible name, e.g. "Status of LL-7K2M9QXA". */
  label: string;
}) {
  const t = useTranslations("app.admin.limelight");
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState(status);
  const [error, setError] = useState<ActionError | undefined>();
  const [pending, start] = useTransition();

  function change(next: string) {
    if (!isStatus(next) || next === value) return;
    const before = value;
    setValue(next);
    setError(undefined);
    start(async () => {
      try {
        const res = await setLeadStatus(leadId, next);
        if (!res.ok) {
          setValue(before);
          setError(res.error);
          return;
        }
        router.refresh();
      } catch {
        setValue(before);
        setError(err("errors.generic"));
      }
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <select
          id={id}
          value={value}
          disabled={pending}
          onChange={(e) => change(e.target.value)}
          className="h-9 rounded-sedan border border-border bg-surface px-2 text-sm text-fg focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {!isStatus(value) && <option value={value}>{value}</option>}
          {LIMELIGHT_LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`statuses.${s}`)}
            </option>
          ))}
        </select>
        {pending && <Loader2 aria-hidden="true" className="size-4 animate-spin text-fg-muted" />}
      </div>
      <ActionErrorMessage error={error} />
    </div>
  );
}
