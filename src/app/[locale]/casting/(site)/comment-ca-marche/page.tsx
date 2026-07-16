import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { HowItWorks } from "@/components/marketing/how-it-works";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "casting.how.meta" });
  return { title: t("title"), description: t("description") };
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <HowItWorks namespace="casting.how" ctaHref="/casting/inscription" />;
}
