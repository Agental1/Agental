import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { auth } from "@/auth";
import { CheckInbox, VerifyEmailButton } from "@/components/auth/email-flows";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "common.emailFlow" });
  return { title: t("verifyTitle"), robots: { index: false }, referrer: "no-referrer" };
}

/**
 * Two states on one address:
 * - with `?token=`, the confirmation email's landing: a button confirms;
 * - without, "Check your inbox" for a signed-in account that still has to
 *   confirm, with the resend button.
 */
export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const raw = (await searchParams).token;
  if (typeof raw === "string" && raw.length > 0) return <VerifyEmailButton token={raw} />;

  const session = await auth();
  if (!session?.user?.email) return redirect({ href: "/connexion", locale });
  return <CheckInbox email={session.user.email} />;
}
