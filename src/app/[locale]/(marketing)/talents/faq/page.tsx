import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { FaqPage } from "@/components/marketing/faq-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "talents.faq.meta" });
  return { title: t("title"), description: t("description") };
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <FaqPage namespace="talents.faq" ctaHref="/talents/inscription" />;
}
