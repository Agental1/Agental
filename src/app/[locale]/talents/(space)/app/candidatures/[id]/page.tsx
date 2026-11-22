import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { toLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { readAnswers, readSubmission } from "@/domain/application-response";
import { RoleResponse } from "@/components/app/role-response";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: "talents" });
  return { title: t("space.candidatures.title") };
}

/**
 * One role found for the performer: its conditions ("send these two videos
 * and answer these two questions"), Accept, then the response form, then
 * Submit for the Agental team's review. The performer's own drafts only.
 */
export default async function RolePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "talents" });
  const session = await auth();
  if (!session?.user?.id) return null;
  const draft = await prisma.applicationDraft.findFirst({
    where: { id, profile: { userId: session.user.id } },
    select: {
      id: true,
      status: true,
      answers: true,
      submittedAt: true,
      profileId: true,
      note: true,
      brief: { select: { title: true, roleName: true, location: true, sourceRef: true, submission: true } },
      media: { select: { slot: true, media: { select: { id: true, title: true, createdAt: true } } } },
    },
  });
  if (!draft) notFound();
  const submission = readSubmission(draft.brief.submission);
  const chosenIds = draft.media.map((m) => m.media.id);
  const clips = await prisma.media.findMany({
    // The 50 newest, plus whatever is already chosen, so a slot never looks empty.
    where: {
      profileId: draft.profileId,
      OR: [{ type: { in: ["SELFTAPE", "VIDEO"] }, status: "READY" }, { id: { in: chosenIds } }],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, title: true, createdAt: true },
  });
  const slots = submission.videos.map((_, i) => draft.media.find((m) => m.slot === i)?.media.id ?? null);
  let host: string | null = null;
  try {
    host = draft.brief.sourceRef ? new URL(draft.brief.sourceRef).hostname : null;
  } catch {
    host = null;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/talents/app/candidatures" className="inline-flex items-center gap-1 text-sm font-bold text-accent hover:underline">
        <ArrowLeft aria-hidden="true" className="size-4" /> {t("space.candidatures.role.back")}
      </Link>
      <div>
        <h1 className="font-display text-3xl font-medium">
          {draft.brief.roleName ? `${draft.brief.roleName} · ` : ""}
          {draft.brief.title}
        </h1>
        {draft.brief.location && <p className="text-fg-muted">{draft.brief.location}</p>}
        {draft.brief.sourceRef && host && (
          <a href={draft.brief.sourceRef} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-accent hover:underline">
            {t("space.candidatures.found.source")} ({host}) <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        )}
      </div>
      {draft.status === "SUBMITTED" && draft.submittedAt && (
        <p role="status" className="rounded-sedan border border-success/40 bg-success/5 p-4 text-sm">
          {t("space.candidatures.role.submitted", { date: dateTime(draft.submittedAt, locale) })}
        </p>
      )}
      <RoleResponse
        draftId={draft.id}
        status={draft.status}
        submission={submission}
        initialAnswers={readAnswers(draft.answers, submission.questions.length)}
        slots={slots}
        clips={clips.map((c) => ({ id: c.id, title: c.title, createdAt: c.createdAt.toISOString() }))}
      />
    </div>
  );
}
