import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { AgentalLogo } from "@/components/brand/logo";
import { AppSidebar, type AppNavItem } from "@/components/app/app-sidebar";

const NAV: AppNavItem[] = [
  { href: "/casting/app", label: "Projets", icon: "projects" },
  { href: "/casting/app/talents", label: "Talents", icon: "talents" },
  { href: "/casting/app/parametres", label: "Paramètres", icon: "settings" },
];

export default async function CastingAppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "CASTING") {
    redirect("/connexion");
  }
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, role: "OWNER" },
  });
  if (!membership) redirect("/casting/inscription");

  return (
    <div data-portal="casting" className="min-h-screen bg-bg text-fg">
      <div className="mx-auto flex max-w-7xl">
        <AppSidebar
          nav={NAV}
          header={
            <Link href="/casting/app" aria-label="Agental">
              <AgentalLogo />
            </Link>
          }
          userLabel={session.user.email ?? "Mon compte"}
        />
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
