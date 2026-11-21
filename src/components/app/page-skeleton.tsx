import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * What an app page shows while its data loads: a title, a lead line and a few
 * cards in the page's own layout, so nothing jumps when the content arrives.
 * Screen readers hear one "Loading" status instead of empty boxes.
 */
export async function PageSkeleton() {
  const t = await getTranslations("common.app.toast");
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">{t("loading")}</span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-36 rounded-sedan-xl" />
        <Skeleton className="h-36 rounded-sedan-xl" />
      </div>
      <Skeleton className="h-52 rounded-sedan-xl" />
    </div>
  );
}
