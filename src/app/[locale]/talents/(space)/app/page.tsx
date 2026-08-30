import { toLocale } from "@/i18n/routing";
import { setRequestLocale } from "next-intl/server";
import {
  Send,
  Clock,
  CalendarCheck,
  Sparkles,
  ArrowRight,
  UserCog,
  Video,
} from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function TalentsDashboard({
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
    include: {
      mandat: true,
      candidatures: { include: { project: true, matchScore: true } },
      media: true,
    },
  });
  if (!profile) return null;

  const cands = profile.candidatures;
  const active = cands.filter((c) =>
    ["NEW", "SHORTLISTED", "SELFTAPE_REQUESTED"].includes(c.status)
  ).length;
  const shortlisted = cands.filter((c) =>
    ["SHORTLISTED", "STARRED", "INVITED"].includes(c.status)
  ).length;
  const invited = cands.filter((c) => c.status === "INVITED").length;
  const urgent = cands.filter(
    (c) => (c.matchScore?.score ?? 0) >= 90 && c.status === "SHORTLISTED"
  ).length;

  const kpis = [
    { label: "Candidatures actives", value: active, icon: Send },
    { label: "Retours en attente", value: shortlisted, icon: Clock },
    { label: "Prochaines auditions", value: invited, icon: CalendarCheck },
    { label: "Opportunités urgentes", value: urgent, icon: Sparkles },
  ];

  const suggestions: { text: string; href: string; cta: string; icon: typeof UserCog }[] = [];
  if (profile.completenessScore < 100)
    suggestions.push({
      text: `Ton profil est complété à ${profile.completenessScore}% — enrichis-le pour que l'IA le fasse mieux performer.`,
      href: "/talents/app/profil",
      cta: "Compléter",
      icon: UserCog,
    });
  if (profile.media.filter((m) => m.type === "SELFTAPE").length === 0)
    suggestions.push({
      text: "Tourne un premier self-tape — on te guide pour qu'il te démarque.",
      href: "/talents/app/self-tape",
      cta: "Self-tape Studio",
      icon: Video,
    });
  if (urgent > 0)
    suggestions.push({
      text: `${urgent} opportunité(s) où tu es très bien classé — soigne ta candidature.`,
      href: "/talents/app/candidatures",
      cta: "Voir",
      icon: Sparkles,
    });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-medium">
            Bienvenue{profile.stageName ? `, ${profile.stageName}` : ""}.
          </h1>
          <p className="text-fg-muted">
            On cherche pour toi, tu te concentres sur ton jeu.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="success">Représenté</Badge>
          <Badge variant="neutral">Plan Free</Badge>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-sedan border border-border bg-surface p-5"
          >
            <k.icon className="size-5 text-accent" />
            <p className="mt-3 font-display text-3xl">{k.value}</p>
            <p className="text-sm text-fg-muted">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-3">
          <h2 className="font-display text-xl font-medium">
            Candidatures récentes
          </h2>
          {cands.length === 0 ? (
            <p className="rounded-sedan border border-dashed border-border bg-surface-2/40 p-6 text-sm text-fg-muted">
              L&apos;IA veille et postule pour toi dès qu&apos;un rôle te
              correspond.
            </p>
          ) : (
            <ul className="space-y-2">
              {cands.slice(0, 4).map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-sedan border border-border bg-surface p-3"
                >
                  {c.matchScore && (
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-accent font-display text-sm text-accent">
                      {c.matchScore.score}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {c.project.title}
                  </span>
                  <Badge variant="accent">{c.status === "SHORTLISTED" ? "Shortlistée" : c.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-display text-xl font-medium">
            <Sparkles className="size-5 text-accent" /> Suggestions de l&apos;IA
          </h2>
          <div className="space-y-2">
            {suggestions.map((s) => (
              <div
                key={s.cta}
                className="rounded-sedan border border-border bg-surface p-4"
              >
                <p className="text-sm text-fg-muted">{s.text}</p>
                <Button asChild variant="link" size="sm" className="mt-1 px-0">
                  <Link href={s.href}>
                    {s.cta} <ArrowRight />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
