import { useTranslations } from "next-intl";
import type { RoleSearchQuota } from "@/domain/role-search";
import { Progress } from "@/components/ui/progress";

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
      <Progress
        value={pct}
        max={100}
        aria-valuetext={`${quota.used} / ${quota.limit}`}
      />
      <p className="mt-1.5 text-[13px] text-fg-muted">
        <SearchUsageLine quota={quota} />
      </p>
    </div>
  );
}
