import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { BriefAssistant } from "@/components/casting/brief-assistant";

export const metadata: Metadata = { title: "Nouveau brief" };

export default async function NouveauBriefPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">Nouveau brief</h1>
        <p className="text-fg-muted">
          Décrivez le rôle — l&apos;assistant s&apos;occupe du reste.
        </p>
      </div>
      <BriefAssistant />
    </div>
  );
}
