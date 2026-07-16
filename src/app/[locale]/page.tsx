import { redirect } from "@/i18n/navigation";

export default async function RootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Talents (B2C) is the brand's primary front door.
  redirect({ href: "/talents", locale });
}
