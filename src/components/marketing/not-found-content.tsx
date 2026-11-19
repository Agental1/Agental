import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AgentalMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/marketing/eyebrow";
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
      <AgentalMark className="h-24 w-auto text-fg" />
      <Eyebrow className="mt-6 block">
        {t("notFound.code")}
      </Eyebrow>
      <h1 className="mt-3 text-3xl font-bold leading-tight tracking-[-0.02em] sm:text-4xl">
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
