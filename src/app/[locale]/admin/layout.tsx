import { toLocale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { AgentalLogo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { AppSidebar, type AppNavItem } from "@/components/app/app-sidebar";

const NAV: AppNavItem[] = [
  { href: "/admin", label: "Supervision", icon: "console" },
  { href: "/admin/audit", label: "Audit trail", icon: "audit" },
  { href: "/admin/mineurs", label: "Dossiers mineurs", icon: "minors" },
];

/** Internal back-office ("Bang") — dense operator skin, admin-only. */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) return redirect({ href: "/connexion", locale });
  const me = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!me?.isAdmin) return redirect({ href: "/", locale });

  return (
    <div data-portal="casting" className="min-h-screen bg-bg text-fg">
      <div className="mx-auto flex max-w-7xl">
        <AppSidebar
          nav={NAV}
          header={
            <Link href="/admin" aria-label="Agental" className="flex items-center gap-2">
              <AgentalLogo />
              <Badge variant="solid">Bang</Badge>
            </Link>
          }
          userLabel={session.user.email ?? "Admin"}
        />
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
