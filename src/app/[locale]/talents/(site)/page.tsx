import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { seo, jsonLd, serviceLd } from "@/lib/seo";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronDown } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AccountCard } from "@/components/auth/account-card";
import { AuthForm } from "@/components/auth/auth-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { loginAction, signupAction } from "@/app/actions/auth";
import { StepsOverview } from "@/components/marketing/steps-overview";
import { SectionNav } from "@/components/marketing/section-nav";
import { LimelightBlock } from "@/components/marketing/limelight-block";
import { FaqAccordion, type FaqGroup } from "@/components/marketing/faq-accordion";
import { fillFaqGroups } from "@/lib/plan-price";
import { TalentsPricingGrid } from "@/components/marketing/pricing-grids";

/**
 * The Talent audience page.
 *
 * At the top, the account card: create an account or sign in, with email and
 * password or a provider. It takes well over 40% of the viewport height on a
 * desktop and fills the first screen on a phone. Right under it, "See more"
 * scrolls to the details, which anyone can read without signing up: the five
 * steps, what the AI agent does, self-tape, Limelight, pricing and the FAQ,
 * with a sticky menu to jump between them.
 *
 * Copy is the existing approved copy from the message files. There are no
 * photos of people and no testimonials.
 */

const SECTION = "mx-auto max-w-site scroll-mt-36 px-[clamp(16px,3vw,40px)] py-[clamp(36px,4.5vw,64px)]";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "talents" });
  return seo({
    locale,
    path: "/talents",
    title: t("meta.title"),
    description: t("meta.description"),
  });
}

export default async function TalentsLanding({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "talents" });
  const ta = await getTranslations({ locale, namespace: "common.audience" });
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            serviceLd({
              locale,
              path: "/talents",
              name: t("meta.title"),
              description: t("meta.description"),
            })
          ),
        }}
      />
      <Top locale={locale} />
      <SectionNav
        label={ta("menu")}
        items={[
          { href: "#how", label: ta("how") },
          { href: "#agent", label: ta("agent") },
          { href: "#selftape", label: ta("selftape") },
          { href: "#websites", label: ta("websites") },
          { href: "#pricing", label: ta("pricing") },
          { href: "#faq", label: ta("faq") },
        ]}
      />
      <div id="how" className="scroll-mt-36 pt-[clamp(36px,4.5vw,64px)]">
        <StepsOverview portal="talents" />
      </div>
      <Agent />
      <SelfTape />
      <section id="websites" className={SECTION}>
        <LimelightBlock />
      </section>
      <Pricing />
      <Faq />
    </>
  );
}

function Top({ locale }: { locale: Locale }) {
  const t = useTranslations("talents");
  const tc = useTranslations("common.account");
  const facts = (["regulated", "ai", "free"] as const).map((key) => ({
    title: t(`proof.${key}.title`),
    body: t(`proof.${key}.body`),
  }));

  return (
    <section
      data-demo="talents-hero"
      className="mx-auto flex min-h-[calc(100svh-5rem)] max-w-site flex-col px-[clamp(16px,3vw,40px)] pb-4 pt-[clamp(20px,3vw,44px)] lg:min-h-0"
    >
      <div className="grid flex-1 items-center gap-[clamp(24px,4vw,64px)] lg:grid-cols-[1fr_auto]">
        <div className="order-2 lg:order-1">
          <h1 className="display-xl max-w-[13ch]">
            {t("hero.title")} {t("hero.titleEmph")}
          </h1>
          <dl className="mt-[clamp(20px,3vw,36px)] grid gap-4 sm:grid-cols-3 lg:max-w-[40rem] lg:grid-cols-1">
            {facts.map((fact) => (
              <div key={fact.title} className="border-l-2 border-accent pl-4">
                <dt className="font-bold leading-snug">{fact.title}</dt>
                <dd className="mt-0.5 text-[15px] leading-snug text-fg-muted">{fact.body}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="order-1 flex w-full flex-col items-center gap-4 justify-self-center lg:order-2 lg:w-[540px]">
        <AccountCard
          signupTitle={t("signup.title")}
          signupLead={t("signup.subtitle")}
          signinTitle={t("login.title")}
          signinLead={t("login.subtitle")}
          signup={
            <>
              <OAuthButtons mode="signup" kind="TALENT" locale={locale} namespace="talents" />
              <AuthForm
                action={signupAction}
                submitLabel={t("signup.submit")}
                kind="TALENT"
                locale={locale}
                size="lg"
              />
              <p className="text-[13.5px] text-fg-muted">{t("hero.note")}</p>
            </>
          }
          signin={
            <>
              <OAuthButtons mode="signin" locale={locale} namespace="talents" />
              <AuthForm action={loginAction} submitLabel={t("login.submit")} locale={locale} size="lg" />
            </>
          }
        />
          <a
            href="#how"
            className="pressable inline-flex h-11 items-center gap-2 rounded-full border border-border-strong bg-surface px-5 text-[15px] font-bold"
          >
            {tc("seeMore")}
            <ChevronDown aria-hidden="true" className="size-4" />
          </a>
        </div>
      </div>

    </section>
  );
}

function Agent() {
  const t = useTranslations("talents.why");
  const items = t.raw("items") as { title: string; body: string }[];
  return (
    <section id="agent" aria-labelledby="agent-title" className={SECTION}>
      <h2 id="agent-title" className="display-md max-w-[22ch]">
        {t("title")}
      </h2>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <details key={item.title} className="group rounded-sedan-lg border border-border bg-surface">
            <summary className="pressable flex min-h-14 items-center justify-between gap-4 rounded-sedan-lg px-5 py-3 [--hover-scale:1.015] [--press-scale:1.03]">
              <h3 className="text-[17px] leading-snug">{item.title}</h3>
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 text-fg-subtle transition-transform duration-200 group-open:rotate-180"
              />
            </summary>
            <p className="enter px-5 pb-4 text-[15px] leading-relaxed text-fg-muted">{item.body}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function SelfTape() {
  const t = useTranslations("talents.selftape");
  return (
    <section id="selftape" aria-labelledby="selftape-title" className={SECTION}>
      <div className="grid gap-x-[clamp(24px,4vw,64px)] gap-y-4 lg:grid-cols-[1fr_1.1fr] lg:items-start">
        <h2 id="selftape-title" className="display-md max-w-[18ch]">
          {t("title")}
        </h2>
        <p className="max-w-[62ch] text-[17px] leading-relaxed text-fg-muted">{t("body")}</p>
      </div>
    </section>
  );
}

function Pricing() {
  const t = useTranslations("talents.pricing");
  const ta = useTranslations("common.audience");
  return (
    <section id="pricing" aria-labelledby="pricing-title" className={SECTION}>
      <h2 id="pricing-title" className="display-md max-w-[22ch]">
        {t("title")}
      </h2>
      <p className="mt-3 max-w-[70ch] text-fg-muted">{t("note")}</p>
      <div className="mt-6">
        <TalentsPricingGrid only={2} />
      </div>
      <p className="mt-4 max-w-[70ch] text-[15px] text-fg-muted">{ta("student")}</p>
      <Link
        href="/talents/tarifs"
        className="mt-2 inline-flex min-h-11 items-center font-bold text-accent underline-offset-4 hover:underline"
      >
        {ta("allPlans")}
      </Link>
    </section>
  );
}

function Faq() {
  const t = useTranslations("talents.faq");
  const ta = useTranslations("common.audience");
  const groups = fillFaqGroups((t.raw("groups") as FaqGroup[]).slice(0, 1), useLocale());
  return (
    <section id="faq" aria-labelledby="faq-title" className={SECTION}>
      <h2 id="faq-title" className="display-md">
        {ta("faq")}
      </h2>
      <div className="mt-6 max-w-[56rem]">
        <FaqAccordion groups={groups} level={3} />
      </div>
      <Link
        href="/talents/faq"
        className="mt-4 inline-flex min-h-11 items-center font-bold text-accent underline-offset-4 hover:underline"
      >
        {ta("allFaq")}
      </Link>
    </section>
  );
}
