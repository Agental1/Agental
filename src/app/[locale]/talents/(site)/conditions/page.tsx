import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { PageHero } from "@/components/marketing/page-hero";
import { Section } from "@/components/marketing/section";
import { TERMS, termsPageEnabled } from "@/domain/legal/terms";

/**
 * Terms of Service (round 8c): NOT PUBLISHED. The page answers 404 unless
 * TERMS_PAGE_ENABLED=true in the environment, which the founders set only once
 * counsel has approved the text (draft and LAWYER notes: docs/legal/TERMS_DRAFT.md).
 * Not linked from anywhere, not in the sitemap, and noindex even when on until
 * the founders say otherwise.
 */
export async function generateMetadata(): Promise<Metadata> {
  if (!termsPageEnabled()) return {};
  return { title: TERMS.title, robots: { index: false, follow: false } };
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  if (!termsPageEnabled()) notFound();
  setRequestLocale(toLocale((await params).locale));
  return (
    <>
      <PageHero eyebrow={TERMS.eyebrow} title={TERMS.title} subtitle={TERMS.updated} />
      <Section width="prose" rhythm="compact">
        <div className="space-y-8">
          {TERMS.sections.map((s) => (
            <section key={s.title}>
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
