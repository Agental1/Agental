import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { ConfirmStudentEmail } from "@/components/talents/student-email";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "talents.space.student" });
  return { title: t("confirmTitle"), robots: { index: false }, referrer: "no-referrer" };
}

/** Landing of the school-email link. The token is used only when the button is pressed. */
export default async function StudentEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "talents.space.student" });
  const raw = (await searchParams).token;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  return (
    <div className="space-y-6">
      <h1 className="text-center font-display text-2xl font-medium">{t("confirmTitle")}</h1>
      {token ? <ConfirmStudentEmail token={token} /> : <p className="text-center text-danger">{t("confirmInvalid")}</p>}
    </div>
  );
}
