import { toLocale } from "@/i18n/routing";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Link } from "@/i18n/navigation";
import { AgentalLogo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";

export default function CastingOnboardingLayout({
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
      data-portal="casting"
      className="flex min-h-screen flex-col bg-bg text-fg"
    >
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Link href="/casting" aria-label="Agental">
            <AgentalLogo />
          </Link>
          <LocaleSwitcher className="ml-auto" />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
