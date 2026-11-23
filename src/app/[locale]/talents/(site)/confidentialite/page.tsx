import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { seo } from "@/lib/seo";
import { PageHero } from "@/components/marketing/page-hero";
import { Section } from "@/components/marketing/section";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "common.privacy" });
  return seo({ locale, path: "/talents/confidentialite", title: t("meta.title"), description: t("meta.description") });
}

/**
 * Privacy policy: what Agental collects, why, where it is kept, and how to
 * have it removed. Plain words, matching what the code does. Draft for the
 * founders to review (docs/HANDOFF.md); also the URL Google asks for.
 */
export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "common.privacy" });
  const sections = t.raw("sections") as { id?: string; title: string; body: string[] }[];
  return (
    <>
      <PageHero eyebrow={t("eyebrow")} title={t("title")} subtitle={t("updated")} />
      <Section width="prose" rhythm="compact">
        <div className="space-y-8">
          {sections.map((s) => (
            <section key={s.title} id={s.id} className="scroll-mt-24">
              <h2 className="text-[22px] font-bold tracking-[-0.01em]">{s.title}</h2>
              {s.body.map((p) => (
                <p key={p} className="mt-3 text-[16px] leading-relaxed text-fg-muted">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </Section>
    </>
  );
}
