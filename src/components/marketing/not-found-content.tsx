import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AgentalMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import type { Portal } from "@/lib/utils";

/**
 * Shared 404 body. Rendered by one not-found.tsx per portal so each inherits
 * its own layout — header, footer and `data-portal` skin — automatically.
 *
 * The copy lives in the portal namespaces because the register is the product:
 * Talents speaks to the artist in tutoiement, Casting addresses the studio in
 * vouvoiement. A single neutral 404 would break that in one of the two.
 */
export function NotFoundContent({ portal }: { portal: Portal }) {
  const t = useTranslations("common");
  const tp = useTranslations(portal === "talents" ? "talents" : "casting");
  const home = portal === "talents" ? "/talents" : "/casting";

  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center sm:px-6">
      <AgentalMark className="h-24 w-auto text-accent-soft" />
      <span className="mt-6 text-xs font-semibold uppercase tracking-[0.15em] text-accent">
        {t("notFound.code")}
      </span>
      <h1 className="mt-3 font-display text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
        {tp("notFound.title")}
      </h1>
      <p className="mt-4 text-lg text-fg-muted">{tp("notFound.body")}</p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href={home}>{t("notFound.backHome")}</Link>
        </Button>
        {portal === "talents" && (
          <Button asChild size="lg" variant="secondary">
            <Link href="/castings">
              {t("notFound.backCastings")} <ArrowRight />
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}
