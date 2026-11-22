import { redirect } from "@/i18n/navigation";
import { toLocale } from "@/i18n/routing";

/**
 * The old "Website" page. Limelight lives on the Subscription page since
 * round 8, so every old link (emails, bookmarks) lands on its section there.
 */
export default async function SitePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return redirect({ href: "/talents/app/abonnement#limelight", locale: toLocale(locale) });
}
