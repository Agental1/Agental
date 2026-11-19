import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { ForgotPasswordForm } from "@/components/auth/email-flows";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "common.emailFlow" });
  return { title: t("forgotTitle"), robots: { index: false } };
}

/** "Forgot password?": request a reset link. */
export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(toLocale(locale));
  return <ForgotPasswordForm />;
}
