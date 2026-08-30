import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Film } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { SelfTapeStudio } from "@/components/talents/self-tape-studio";
import { parseJson } from "@/domain/json";
import { z } from "zod";

export const metadata: Metadata = { title: "Self-tape Studio" };

const Breakdown = z.object({
  framing: z.number().default(0),
  light: z.number().default(0),
  sound: z.number().default(0),
});

export default async function SelfTapePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) return null;
  const profile = await prisma.artistProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) return null;

  const takes = await prisma.selfTape.findMany({
    where: { media: { profileId: profile.id } },
    include: { media: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">Self-tape Studio</h1>
        <p className="text-fg-muted">
          Ton self-tape peut tout changer. On t&apos;aide à le réussir — cadrage,
          lumière et son en temps réel.
        </p>
      </div>

      <SelfTapeStudio />

      {takes.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-xl font-medium">Tes prises</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {takes.map((t) => {
              const b = parseJson(Breakdown, t.qualityBreakdown);
              return (
                <div
                  key={t.id}
                  className="rounded-sedan border border-border bg-surface p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Film className="size-4 text-accent" /> Prise{" "}
                      {t.takeNumber}
                    </span>
                    <span
                      className={`font-display text-lg ${
                        (t.qualityScore ?? 0) >= 75 ? "text-success" : "text-accent"
                      }`}
                    >
                      {t.qualityScore ?? "—"}
                    </span>
                  </div>
                  <video
                    src={`/api/media/${t.mediaId}`}
                    controls
                    className="mt-3 aspect-video w-full rounded-sedan bg-noirchaud object-cover"
                  />
                  <p className="mt-2 text-xs text-fg-muted">
                    Cadrage {b.framing} · Lumière {b.light} · Son {b.sound}
                  </p>
                  {t.lowBandwidth && (
                    <Badge variant="neutral" className="mt-2">
                      Mode dégradé
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
