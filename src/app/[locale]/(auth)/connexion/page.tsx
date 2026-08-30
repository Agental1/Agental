import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { loginAction } from "@/app/actions/auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const t = await getTranslations({ locale: toLocale(rawLocale), namespace: "talents" });
  return { title: t("login.metaTitle") };
}

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "talents" });
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="font-display text-2xl font-medium">{t("login.title")}</h1>
        <p className="text-sm text-fg-muted">{t("login.subtitle")}</p>
      </div>
      <AuthForm action={loginAction} submitLabel={t("login.submit")} locale={locale} />
      <p className="text-center text-sm text-fg-muted">
        {t("login.noAccount")}{" "}
        <Link href="/talents/inscription" className="inline-flex min-h-11 items-center md:min-h-0 text-accent hover:underline">
          {t("login.signUp")}
        </Link>
      </p>
    </div>
  );
}
