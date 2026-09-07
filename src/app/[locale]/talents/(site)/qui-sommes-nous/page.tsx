import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { seo } from "@/lib/seo";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/marketing/page-hero";
import { Section } from "@/components/marketing/section";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { InverseBand } from "@/components/marketing/inverse-band";
import { AgentalMark } from "@/components/brand/logo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "talents.about" });
  return seo({
    locale,
    path: "/talents/qui-sommes-nous",
    title: t("meta.title"),
    description: t("meta.description"),
  });
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  return <AboutContent />;
}

interface Member {
  name: string;
  role: string;
  body: string;
}

function AboutContent() {
  const t = useTranslations("talents.about");
  const members = t.raw("team.members") as Member[];

  return (
    <>
      <PageHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        subtitle={t("hero.subtitle")}
      />

      <Section width="prose" rhythm="major">
        <h2 className="text-[clamp(24px,3.2vw,38px)] font-bold leading-[1.1] tracking-[-0.02em]">
          {t("origin.title")}
        </h2>
        <p className="mt-4 text-[17px] leading-relaxed text-fg-muted">
          {t("origin.body")}
        </p>
      </Section>

      <Section tone="band" rhythm="band">
        <h2 className="text-[clamp(24px,3.2vw,38px)] font-bold leading-[1.1] tracking-[-0.02em]">
          {t("team.title")}
        </h2>
        <p className="mt-3 max-w-[62ch] leading-relaxed text-fg-muted">
          {t("team.lead")}
        </p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {members.map((m) => (
            <div
              key={m.name}
              className="rounded-sedan-xl border border-border bg-surface p-[clamp(20px,3vw,26px)]"
            >
              {/* No founder photography exists, and the portrait sets are
                  illustrative characters — using one here would read as a
                  photo of this person. The mark stands in instead. */}
              <span className="flex size-11 items-center justify-center rounded-full bg-accent-soft">
                <AgentalMark className="h-5 w-auto text-accent" />
              </span>
              <h3 className="mt-4 text-lg font-bold">{m.name}</h3>
              <Eyebrow className="block">
                {m.role}
              </Eyebrow>
              <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
                {m.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section width="prose" rhythm="major">
        <h2 className="text-[clamp(24px,3.2vw,38px)] font-bold leading-[1.1] tracking-[-0.02em]">
          {t("stance.title")}
        </h2>
        <p className="mt-4 text-[17px] leading-relaxed text-fg-muted">
          {t("stance.body")}
        </p>

        <InverseBand className="mt-12">
          <h2 className="text-[clamp(22px,3vw,32px)] font-bold leading-[1.1] tracking-[-0.02em]">
            {t("mission.title")}
          </h2>
          <p className="mx-auto mt-3 max-w-[58ch] leading-relaxed text-fg-inverse-muted">
            {t("mission.body")}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/talents/inscription">
                {t("mission.ctaPrimary")} <ArrowRight />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="border-border-inverse bg-transparent text-fg-inverse hover:bg-fg-inverse/10"
            >
              <Link href="/casting">{t("mission.ctaSecondary")}</Link>
            </Button>
          </div>
        </InverseBand>
      </Section>
    </>
  );
}
