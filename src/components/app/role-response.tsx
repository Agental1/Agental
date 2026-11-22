"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Video } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { ActionErrorMessage, useActionErrorText } from "@/components/app/action-error";
import { SelfTapeStudio } from "@/components/talents/self-tape-studio";
import type { ActionError } from "@/domain/action-result";
import { ANSWER_MAX, missingParts, type Submission } from "@/domain/application-response";
import { acceptRole, saveAnswers, setSlotVideo, submitResponse } from "@/app/actions/application-response";
import { dateTime } from "@/lib/format";

interface Clip {
  id: string;
  title: string | null;
  createdAt: string;
}

/**
 * The role's conditions, "Accept", then the response: a text box per
 * question, and per requested video the choice to record it (saved in Reel &
 * Self-tape, private, linked to this application) or to pick one from there.
 * "Submit" sends it to the Agental team's review, nowhere else.
 */
export function RoleResponse({
  draftId,
  status,
  submission,
  initialAnswers,
  slots,
  clips,
}: {
  draftId: string;
  status: string;
  submission: Submission;
  initialAnswers: string[];
  slots: (string | null)[];
  clips: Clip[];
}) {
  const t = useTranslations("talents.space.candidatures.role");
  const locale = useLocale();
  const router = useRouter();
  const errorText = useActionErrorText();
  const [answers, setAnswers] = useState(initialAnswers);
  const [pending, start] = useTransition();
  const [error, setError] = useState<ActionError | undefined>();
  const [recording, setRecording] = useState<number | null>(null);
  const accepted = status === "ACCEPTED";
  const done = status === "SUBMITTED";
  const canAccept = status === "DRAFT" || status === "NEEDS_INFO";
  const filled = slots.flatMap((s, i) => (s ? [i] : []));
  const missing = missingParts(submission, answers, filled);
  const label = (c: Clip) => c.title || `${t("untitled")} · ${dateTime(new Date(c.createdAt), locale)}`;

  function run(fn: () => Promise<{ ok: boolean; error?: ActionError }>, onOk?: () => void) {
    setError(undefined);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        if (res.error) toast.error(errorText(res.error) ?? "");
        return;
      }
      onOk?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="conditions" className="space-y-3 rounded-sedan-xl border border-border bg-surface p-5">
        <h2 id="conditions" className="font-display text-xl font-medium">{t("conditions")}</h2>
        {submission.questions.length + submission.videos.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("nothingAsked")}</p>
        ) : (
          <>
            <p className="text-sm">{t("conditionsSummary", { videos: submission.videos.length, questions: submission.questions.length })}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
              {submission.videos.map((v, i) => (
                <li key={`v${i}`}>
                  <span className="font-medium text-fg">{t("video", { n: i + 1 })}:</span> {v}
                </li>
              ))}
              {submission.questions.map((q, i) => (
                <li key={`q${i}`}>
                  <span className="font-medium text-fg">{t("question", { n: i + 1 })}:</span> {q}
                </li>
              ))}
            </ul>
          </>
        )}
        {canAccept && (
          <div className="space-y-1 pt-1">
            <Button loading={pending} onClick={() => run(() => acceptRole(draftId))}>
              {t("accept")}
            </Button>
            <p className="text-xs text-fg-muted">{t("acceptHint")}</p>
          </div>
        )}
      </section>

      {(accepted || done) && (
        <section className="space-y-5 rounded-sedan-xl border border-border bg-surface p-5">
          {submission.videos.map((v, i) => {
            const chosen = clips.find((c) => c.id === slots[i]);
            return (
              <div key={`slot${i}`} className="space-y-2">
                <p className="text-sm font-bold">
                  {t("video", { n: i + 1 })}: <span className="font-normal">{v}</span>
                </p>
                {chosen && (
                  <p className="flex items-center gap-2 text-sm text-success">
                    <Check aria-hidden="true" className="size-4" /> {t("chosen", { title: label(chosen) })}
                  </p>
                )}
                {accepted && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setRecording(i)}>
                      <Video aria-hidden="true" className="size-4" /> {t("record")}
                    </Button>
                    {clips.length > 0 ? (
                      <Select value={slots[i] ?? ""} onValueChange={(id) => run(() => setSlotVideo(draftId, i, id))}>
                        <SelectTrigger aria-label={t("pick")} className="h-9 w-72 max-w-full text-sm">
                          <SelectValue placeholder={t("pick")} />
                        </SelectTrigger>
                        <SelectContent>
                          {clips.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {label(c)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-fg-muted">{t("pickNone")}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {submission.questions.map((q, i) => (
            <div key={`answer${i}`} className="space-y-1.5">
              <label htmlFor={`answer-${i}`} className="text-sm font-bold">
                {t("question", { n: i + 1 })}: <span className="font-normal">{q}</span>
              </label>
              <textarea
                id={`answer-${i}`}
                value={answers[i] ?? ""}
                readOnly={!accepted}
                maxLength={ANSWER_MAX}
                rows={4}
                placeholder={t("yourAnswer")}
                onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
                className="w-full rounded-sedan border border-border bg-surface px-3 py-2 text-sm focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </div>
          ))}

          <ActionErrorMessage error={error} />

          {accepted && (
            <div className="flex flex-wrap items-center gap-3">
              {submission.questions.length > 0 && (
                <Button variant="outline" disabled={pending} onClick={() => run(() => saveAnswers(draftId, answers), () => toast.success(t("saved")))}>
                  {t("saveDraft")}
                </Button>
              )}
              <Button loading={pending} disabled={missing.length > 0} onClick={() => run(() => submitResponse(draftId, answers))}>
                {t("submit")}
              </Button>
              <p className="basis-full text-xs text-fg-muted">{t("submitHint")}</p>
            </div>
          )}
        </section>
      )}

      <Dialog open={recording !== null} onOpenChange={(o) => !o && setRecording(null)}>
        <DialogContent className="max-h-[90svh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("recordTitle", { n: (recording ?? 0) + 1 })}</DialogTitle>
            <DialogDescription>{t("recordHint")}</DialogDescription>
          </DialogHeader>
          {recording !== null && (
            <SelfTapeStudio
              fixedDestination="library"
              onSaved={(mediaId) => {
                const slot = recording;
                setRecording(null);
                run(() => setSlotVideo(draftId, slot, mediaId));
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
