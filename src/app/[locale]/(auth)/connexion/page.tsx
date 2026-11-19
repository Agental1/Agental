import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { loginAction } from "@/app/actions/auth";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { ActionErrorMessage } from "@/components/app/action-error";
import { authErrorKey } from "@/domain/auth-errors";

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
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { locale: rawLocale } = await params;
  // ?error= comes from our OAuth redirects and from Auth.js. It is mapped to a
  // known message key and never rendered as is.
  const errorKey = authErrorKey((await searchParams).error);
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "talents" });
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="font-display text-2xl font-medium">{t("login.title")}</h1>
        <p className="text-sm text-fg-muted">{t("login.subtitle")}</p>
      </div>
      {errorKey && <ActionErrorMessage error={{ key: errorKey }} />}
      <OAuthButtons mode="signin" locale={locale} namespace="talents" />
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
