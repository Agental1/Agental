import { BetaPriceNote } from "@/components/ui/beta-price";
import { useLocale, useTranslations } from "next-intl";
import { formatPlanPrice } from "@/lib/plan-price";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { SampleSite } from "@/components/talents/sample-site";
import { LIMELIGHT } from "@/domain/limelight";
import { cn } from "@/lib/utils";

/**
 * The Limelight entry point used on the home page and the Talent page: one
 * line, a preview of a sample site, "Try it" and "See pricing". It always
 * wears the Talent theme, since Limelight belongs to the Talent side.
 */
export function LimelightBlock({ className }: { className?: string }) {
  const t = useTranslations("common.home.limelight");
  const tb = useTranslations("talents.limelight.band");
  const locale = useLocale();
  const tf = useTranslations("talents.limelight.frame");
  const th = useTranslations("talents.limelight.hero");
  const path = `/talents/${LIMELIGHT.slug}`;

  return (
    <div
      data-portal="talents"
      className={cn(
        "grid items-center gap-[clamp(24px,4vw,56px)] rounded-sedan-2xl border border-accent/50 bg-surface p-[clamp(20px,3.5vw,44px)] text-fg lg:grid-cols-[1fr_1.1fr]",
        className
      )}
    >
      <div>
        <p className="text-[14px] font-bold text-accent">{LIMELIGHT.name}</p>
        <h2 className="display-md mt-2 max-w-[16ch]">{t("title")}</h2>
        <p className="mt-3 max-w-[48ch] text-fg-muted">{tb("body", { price: formatPlanPrice(LIMELIGHT.plans.essential.priceUsd * 100, locale) })}</p>
        <BetaPriceNote className="mt-2" />
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button asChild size="lg">
            <Link href={`${path}#try`}>{t("try")}</Link>
          </Button>
          <Link
            href={`${path}/exemple`}
            className="inline-flex min-h-11 items-center font-bold text-accent underline-offset-4 hover:underline"
          >
            {th("explore")}
          </Link>
          <Link
            href={`${path}#start`}
            className="inline-flex min-h-11 items-center font-bold text-accent underline-offset-4 hover:underline"
          >
            {t("pricing")}
          </Link>
        </div>
      </div>
      <figure className="min-w-0">
        <div className="ll-frame">
          <SampleSite />
        </div>
        <figcaption className="mt-2 text-[13px] text-fg-subtle">{tf("caption")}</figcaption>
      </figure>
    </div>
  );
}
