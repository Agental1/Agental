import { toLocale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";

export default async function RootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  // Talents (B2C) is the brand's primary front door.
  redirect({ href: "/talents", locale });
}
