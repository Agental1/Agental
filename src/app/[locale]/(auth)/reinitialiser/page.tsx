import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { ResetPasswordForm } from "@/components/auth/email-flows";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "common.emailFlow" });
  return { title: t("resetTitle"), robots: { index: false }, referrer: "no-referrer" };
}

/** Where a reset email lands: choose a new password. */
export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(toLocale(locale));
  const raw = (await searchParams).token;
  const token = typeof raw === "string" && raw.length > 0 ? raw : null;
  return <ResetPasswordForm token={token} />;
}
