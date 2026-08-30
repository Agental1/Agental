import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { HowItWorks } from "@/components/marketing/how-it-works";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "casting.how" });
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
  return <HowItWorks namespace="casting.how" ctaHref="/casting/inscription" />;
}
