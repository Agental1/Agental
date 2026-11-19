import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AgentalMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

/**
 * 404 inside the Casting workspace. This one is genuinely reachable: the two
 * project pages call notFound() when a project id is unknown or belongs to
 * another organisation (projets/[id]/page.tsx, .../talent/[cid]/page.tsx).
 *
 * Living in the (space) group means it inherits the sidebar and the dark B2B
 * skin, so a casting director who follows a stale project link stays inside
 * their workspace instead of being thrown onto the light Talents catch-all.
 *
 * Register is vouvoiement here, matching the rest of the Casting namespace.
 */
export default function CastingSpaceNotFound() {
  const t = useTranslations("common");
  const tc = useTranslations("casting");

  return (
    <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center">
      <AgentalMark className="h-16 w-auto text-fg" />
      <span className="mt-5 text-xs font-semibold uppercase tracking-[0.15em] text-accent">
        {t("notFound.code")}
      </span>
      <h1 className="mt-3 font-display text-2xl font-medium tracking-tight sm:text-3xl">
        {tc("notFound.title")}
      </h1>
      <p className="mt-3 text-fg-muted">{tc("notFound.body")}</p>
      <Button asChild size="lg" className="mt-7">
        <Link href="/casting/app">
          {t("notFound.backHome")} <ArrowRight />
        </Link>
      </Button>
    </section>
  );
}
