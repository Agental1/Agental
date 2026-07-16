import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { loginAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="font-display text-2xl font-medium">Content de te revoir</h1>
        <p className="text-sm text-fg-muted">
          Connecte-toi à ton espace Agental.
        </p>
      </div>
      <AuthForm action={loginAction} submitLabel="Se connecter" locale={locale} />
      <p className="text-center text-sm text-fg-muted">
        Pas encore de compte ?{" "}
        <Link href="/talents/inscription" className="text-accent hover:underline">
          Devenir membre
        </Link>
      </p>
    </div>
  );
}
