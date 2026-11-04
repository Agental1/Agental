import { toLocale } from "@/i18n/routing";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Link } from "@/i18n/navigation";
import { AgentalLogo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";

export default function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = use(params);
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  return (
    <div
      data-portal="talents"
      className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 py-12 text-fg"
    >
      <Link href="/talents" className="mb-8">
        <AgentalLogo />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
      {/* Signing in is exactly where a wrong language loses the user, and it
          was the one place with no way to change it. */}
      <LocaleSwitcher className="mt-8" />
    </div>
  );
}
