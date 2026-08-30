import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Heart, Eye, HandHeart } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { AgentalMark } from "@/components/brand/logo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "talents.about" });
  return { title: t("meta.title"), description: t("meta.description") };
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

const VALUE_ICONS = [Heart, Eye, HandHeart];

function AboutContent() {
  const t = useTranslations("talents.about");
  const story = t.raw("story") as string[];
  const values = t.raw("values") as { title: string; body: string }[];
  const founders = t.raw("founders") as { name: string; role: string }[];

  return (
    <>
      <PageHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        subtitle={t("hero.subtitle")}
      />
      <section className="mx-auto max-w-3xl space-y-4 px-4 py-16 sm:px-6">
        {story.map((p) => (
          <p key={p} className="text-lg leading-relaxed text-fg-muted">
            {p}
          </p>
        ))}
      </section>

      <section className="border-y border-border bg-surface-2/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-3xl font-medium">
            {t("valuesTitle")}
          </h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {values.map((v, i) => {
              const Icon = VALUE_ICONS[i % VALUE_ICONS.length];
              return (
                <div
                  key={v.title}
                  className="rounded-sedan border border-border bg-surface p-6"
                >
                  <span className="flex size-10 items-center justify-center rounded-sedan bg-accent-soft text-accent">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-4 font-medium">{v.title}</h3>
                  <p className="mt-1.5 text-sm text-fg-muted">{v.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="font-display text-3xl font-medium">
          {t("foundersTitle")}
        </h2>
        <div className="mt-8 flex flex-wrap gap-5">
          {founders.map((f) => (
            <div
              key={f.name}
              className="flex items-center gap-3 rounded-sedan border border-border bg-surface p-4 pr-6"
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft">
                <AgentalMark className="h-5 w-auto text-accent" />
              </span>
              <div>
                <p className="font-medium">{f.name}</p>
                <p className="text-sm text-fg-muted">{f.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
