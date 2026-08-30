import { toLocale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { AgentalLogo } from "@/components/brand/logo";
import { AppSidebar, type AppNavItem } from "@/components/app/app-sidebar";

const NAV: AppNavItem[] = [
  { href: "/talents/app", label: "Tableau de bord", icon: "dashboard" },
  { href: "/talents/app/profil", label: "Profil", icon: "user" },
  { href: "/talents/app/candidatures", label: "Candidatures", icon: "send" },
  { href: "/talents/app/self-tape", label: "Self-tape", icon: "video" },
  { href: "/talents/app/carriere", label: "Carrière", icon: "career" },
  { href: "/talents/app/abonnement", label: "Abonnement", icon: "billing" },
  { href: "/talents/app/messages", label: "Messages", icon: "messages" },
  { href: "/talents/app/parametres", label: "Paramètres", icon: "settings" },
];

export default async function TalentsAppLayout({
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
  if (!session?.user?.id || session.user.kind !== "TALENT") {
    return redirect({ href: "/connexion", locale });
  }
  // Representation gate: opportunities require a signed Mandat, not a plan.
  const profile = await prisma.artistProfile.findUnique({
    where: { userId: session.user.id },
    include: { mandat: true },
  });
  if (!profile?.mandat?.signedAt || profile.mandat.status !== "ACTIVE") {
    return redirect({ href: "/talents/inscription", locale });
  }

  return (
    <div data-portal="talents" className="min-h-screen bg-bg text-fg">
      <div className="mx-auto flex max-w-7xl">
        <AppSidebar
          nav={NAV}
          header={
            <Link href="/talents/app" aria-label="Agental">
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
