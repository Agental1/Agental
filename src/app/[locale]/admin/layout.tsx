import { toLocale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { AppShell, type AppNavItem } from "@/components/app/app-shell";

const NAV = [
  { href: "/admin", key: "overview", icon: "console" },
  { href: "/admin/comptes", key: "accounts", icon: "console" },
  { href: "/admin/messages", key: "messages", icon: "messages" },
  { href: "/admin/limelight", key: "limelight", icon: "website" },
  { href: "/admin/recherches", key: "roleSearches", icon: "console" },
  { href: "/admin/revenus", key: "revenue", icon: "console" },
  { href: "/admin/audit", key: "audit", icon: "audit" },
  { href: "/admin/mineurs", key: "minors", icon: "minors" },
] as const;

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
  const t = await getTranslations({ locale, namespace: "app" });

  const session = await auth();
  if (!session?.user?.id) return redirect({ href: "/connexion", locale });
  const me = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!me?.isAdmin) return redirect({ href: "/", locale });

  return (
    <AppShell
      portal="casting"
      home="/admin"
      nav={NAV.map((n): AppNavItem => ({
        href: n.href,
        icon: n.icon,
        label: t(`admin.nav.${n.key}`),
      }))}
      userLabel={session.user.email ?? "Admin"}
      tag={<Badge variant="solid">Bang</Badge>}
    >
      {children}
    </AppShell>
  );
}
