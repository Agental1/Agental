"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { ActionErrorMessage } from "@/components/app/action-error";
import { acceptRole, declineRole, undoDeclineRole } from "@/app/actions/application-response";
import type { ActionError } from "@/domain/action-result";

export interface FoundRole {
  id: string;
  status: string;
  role: string | null;
  project: string;
  production: string | null;
  description: string;
  dates: string | null;
  location: string | null;
  pay: string | null;
  questions: string[];
  videos: string[];
  sourceUrl: string | null;
  sourceHost: string | null;
}

/**
 * One role found (round 8b): the full description of what is asked first,
 * then a green Accept and a red Decline. Accept takes the role on ("Accepted:
 * the Agental team is on it") and opens the existing response flow. Decline
 * records the decision and takes the role off the list, with Undo for a few
 * seconds.
 */
export function FoundRoleCard({ role }: { role: FoundRole }) {
  const t = useTranslations("talents.space.candidatures.decide");
  const [status, setStatus] = useState(role.status);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<ActionError | undefined>();
  const [pending, start] = useTransition();
  const open = status === "DRAFT" || status === "NEEDS_INFO";

  function accept() {
    setError(undefined);
    start(async () => {
      const res = await acceptRole(role.id);
      if (!res.ok) return setError(res.error);
      setStatus("ACCEPTED");
    });
  }

  function decline() {
    setError(undefined);
    start(async () => {
      const res = await declineRole(role.id);
      if (!res.ok) return setError(res.error);
      setHidden(true);
      toast(t("declined"), {
        duration: 6000,
        action: {
          label: t("undo"),
          onClick: async () => {
            const back = await undoDeclineRole(role.id);
            if (back.ok) {
              setStatus("DRAFT");
              setHidden(false);
            } else toast(t("undoFailed"));
          },
        },
      });
    });
  }

  if (hidden) return null;

  const rows: [string, string | null][] = [
    [t("role"), role.role],
    [t("project"), [role.project, role.production].filter(Boolean).join(" · ") || null],
    [t("dates"), role.dates],
    [t("location"), role.location],
    [t("pay"), role.pay],
  ];

  return (
    <li className="rounded-sedan-xl border border-border bg-surface p-5">
      <h3 className="font-display text-lg font-medium">
        {role.role ? `${role.role} · ` : ""}
        {role.project}
      </h3>
      {open && <p className="mt-1 text-sm text-fg-muted">{t("intro")}</p>}

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-fg-muted">{label}</dt>
            <dd className="font-medium">{value ?? t("notGiven")}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 text-sm">
        <p className="text-fg-muted">{t("toSend")}</p>
        {role.questions.length === 0 && role.videos.length === 0 ? (
          <p className="font-medium">{t("nothingToSend")}</p>
        ) : (
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {role.videos.map((v, i) => (
              <li key={`v${i}`}>{t("video", { n: i + 1, text: v })}</li>
            ))}
            {role.questions.map((q, i) => (
              <li key={`q${i}`}>{t("question", { n: i + 1, text: q })}</li>
            ))}
          </ul>
        )}
      </div>

      {role.description && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-bold">{t("fullNotice")}</summary>
          <p className="mt-2 whitespace-pre-wrap text-fg-muted">{role.description}</p>
        </details>
      )}
      {role.sourceUrl && (
        <a
          href={role.sourceUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-2 inline-block text-sm font-bold text-accent hover:underline"
        >
          {t("source", { host: role.sourceHost ?? "" })}
        </a>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {open ? (
          <>
            <Button
              onClick={accept}
              loading={pending}
              variant="danger"
              className="bg-[var(--go)] text-[var(--go-fg)]"
            >
              <Check aria-hidden="true" /> {t("accept")}
            </Button>
            <Button
              onClick={decline}
              disabled={pending}
              variant="danger"
            >
              <X aria-hidden="true" /> {t("decline")}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-[var(--go)]">
              {status === "SUBMITTED" ? t("submitted") : t("accepted")}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/talents/app/candidatures/${role.id}`}>{t("open")}</Link>
            </Button>
          </>
        )}
      </div>
      <ActionErrorMessage error={error} className="mt-3" />
    </li>
  );
}
