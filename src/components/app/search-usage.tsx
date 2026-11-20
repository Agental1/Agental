import { useTranslations } from "next-intl";
import type { RoleSearchQuota } from "@/domain/role-search";

/** "3 of 5 searches left · resets in 12 days", or "5 searches available". */
export function SearchUsageLine({ quota }: { quota: RoleSearchQuota }) {
  const t = useTranslations("talents.space.dashboard.findRoles");
  if (quota.resetInDays === null) return <>{t("available", { count: quota.limit })}</>;
  return (
    <>
      {quota.remaining > 0
        ? t("leftOf", { left: quota.remaining, limit: quota.limit, days: quota.resetInDays })
        : t("noneLeft", { days: quota.resetInDays })}
    </>
  );
}

/** A small usage bar: filled part = searches used in the current period. */
export function SearchUsageBar({ quota, className }: { quota: RoleSearchQuota; className?: string }) {
  const pct = quota.limit > 0 ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 0;
  return (
    <div className={className}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={quota.limit}
        aria-valuenow={quota.used}
        aria-valuetext={`${quota.used} / ${quota.limit}`}
        className="h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-[13px] text-fg-muted">
        <SearchUsageLine quota={quota} />
      </p>
    </div>
  );
}
