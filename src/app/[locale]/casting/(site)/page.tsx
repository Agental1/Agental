import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { seo, jsonLd, serviceLd } from "@/lib/seo";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronDown } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AccountCard } from "@/components/auth/account-card";
import { AuthForm } from "@/components/auth/auth-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { loginAction, signupAction } from "@/app/actions/auth";
import { InteractiveDemo } from "@/components/casting/interactive-demo";
import { StepsOverview } from "@/components/marketing/steps-overview";
import { SectionNav } from "@/components/marketing/section-nav";
import { FaqAccordion, type FaqGroup } from "@/components/marketing/faq-accordion";
import { CastingPricingGrid } from "@/components/marketing/pricing-grids";
import { CASTING_TYPES } from "@/data/casting-types";

/**
 * The Casting audience page, on the night theme.
 *
 * Same build as the Talent page: the account card on top (create an account
 * or sign in), "See more" right under it, then the details anyone can read
 * without signing up: how it works with the product shown working, the kinds
 * of roles, how shortlists are ranked and explained, pricing and the FAQ.
 */

const SECTION = "mx-auto max-w-site scroll-mt-36 px-[clamp(16px,3vw,40px)] py-[clamp(36px,4.5vw,64px)]";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "casting" });
  return seo({
    locale,
    path: "/casting",
    title: t("meta.title"),
    description: t("meta.description"),
  });
}

export default async function CastingLanding({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "casting" });
  const ta = await getTranslations({ locale, namespace: "common.audience" });
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            serviceLd({
              locale,
              path: "/casting",
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
          { href: "#types", label: ta("types") },
          { href: "#ranking", label: ta("ranking") },
          { href: "#pricing", label: ta("pricing") },
          { href: "#faq", label: ta("faq") },
        ]}
      />
      <div id="how" className="scroll-mt-36 pt-[clamp(36px,4.5vw,64px)]">
        <StepsOverview portal="casting" />
        {/* The product, live: a brief in, a ranked shortlist out. */}
        <div className="mx-auto mt-6 max-w-site px-[clamp(16px,3vw,40px)]">
          <div className="max-w-[44rem]">
            <InteractiveDemo />
          </div>
        </div>
      </div>
      <Types />
      <Ranking />
      <Pricing />
      <Faq />
    </>
  );
}

function Top({ locale }: { locale: Locale }) {
  const t = useTranslations("casting");
  const tt = useTranslations("talents.login");
  const tc = useTranslations("common.account");

  return (
    <section className="mx-auto flex min-h-[calc(100svh-5rem)] max-w-site flex-col px-[clamp(16px,3vw,40px)] pb-4 pt-[clamp(20px,3vw,44px)] lg:min-h-0">
      <div className="grid flex-1 items-center gap-[clamp(24px,4vw,64px)] lg:grid-cols-[1fr_auto]">
        <div className="order-2 lg:order-1">
          <h1 className="display-xl max-w-[15ch]">
            {t("hero.title")} {t("hero.titleEmph")}
          </h1>
          <p className="mt-5 max-w-[54ch] text-[17px] leading-relaxed text-fg-muted">
            {t("hero.subtitle")}
          </p>
        </div>

        <div className="order-1 flex w-full flex-col items-center gap-4 justify-self-center lg:order-2 lg:w-[540px]">
        <AccountCard
          signupTitle={t("signup.title")}
          signupLead={t("signup.subtitle")}
          signinTitle={tt("title")}
          signinLead={tt("subtitle")}
          signup={
            <>
              <OAuthButtons mode="signup" kind="CASTING" locale={locale} namespace="casting" tone="dark" />
              <AuthForm
                action={signupAction}
                submitLabel={t("signup.submit")}
                kind="CASTING"
                locale={locale}
                size="lg"
              />
              <p className="text-[13.5px] text-fg-muted">{t("hero.note")}</p>
            </>
          }
          signin={
            <>
              <OAuthButtons mode="signin" locale={locale} namespace="casting" tone="dark" />
              <AuthForm action={loginAction} submitLabel={tt("submit")} locale={locale} size="lg" />
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

/** The kinds of roles, by their existing names. A plain list: nothing to click. */
function Types() {
  const ta = useTranslations("common.audience");
  const tt = useTranslations("talents.castingTypes");
  return (
    <section id="types" aria-labelledby="types-title" className={SECTION}>
      <h2 id="types-title" className="display-md">
        {ta("typesTitle")}
      </h2>
      <p className="mt-3 max-w-[62ch] text-fg-muted">{ta("typesLead")}</p>
      <ul className="mt-6 flex flex-wrap gap-2">
        {CASTING_TYPES.map((type) => (
          <li
            key={type.slug}
            className="rounded-full border border-border bg-surface px-4 py-2 text-[15px] font-bold"
          >
            {tt(`${type.slug}.name`)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Ranking() {
  const t = useTranslations("casting.neutrality");
  const items = t.raw("items") as { title: string; body: string }[];
  return (
    <section id="ranking" aria-labelledby="ranking-title" className={SECTION}>
      <div className="grid gap-x-[clamp(24px,4vw,64px)] gap-y-4 lg:grid-cols-[1fr_1.1fr] lg:items-start">
        <h2 id="ranking-title" className="display-md max-w-[18ch]">
          {t("title")}
        </h2>
        <p className="max-w-[62ch] text-[17px] leading-relaxed text-fg-muted">{t("body")}</p>
      </div>
      <dl className="mt-6 grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.title} className="rounded-sedan-lg border border-border bg-surface p-5">
            <dt className="text-[17px] font-bold leading-snug">{item.title}</dt>
            <dd className="mt-1.5 text-[15px] leading-relaxed text-fg-muted">{item.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Pricing() {
  const t = useTranslations("casting.pricing");
  return (
    <section id="pricing" aria-labelledby="pricing-title" className={SECTION}>
      <h2 id="pricing-title" className="display-md max-w-[22ch]">
        {t("title")}
      </h2>
      <p className="mt-3 max-w-[70ch] text-fg-muted">{t("note")}</p>
      <div className="mt-6">
        <CastingPricingGrid />
      </div>
    </section>
  );
}

function Faq() {
  const t = useTranslations("casting.faq");
  const ta = useTranslations("common.audience");
  const groups = (t.raw("groups") as FaqGroup[]).slice(0, 1);
  return (
    <section id="faq" aria-labelledby="faq-title" className={SECTION}>
      <h2 id="faq-title" className="display-md">
        {ta("faq")}
      </h2>
      <div className="mt-6 max-w-[56rem]">
        <FaqAccordion groups={groups} level={3} />
      </div>
      <Link
        href="/casting/faq"
        className="mt-4 inline-flex min-h-11 items-center font-bold text-accent underline-offset-4 hover:underline"
      >
        {ta("allFaq")}
      </Link>
    </section>
  );
}
