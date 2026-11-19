"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Check, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionErrorMessage } from "@/components/app/action-error";
import { decideDeal, type DealDecisionState } from "@/app/actions/deals";
import type { PendingDeal } from "@/lib/n8n/deals";

/** One deal waiting for the talent's answer. The talent always says yes first. */
function DealCard({ deal }: { deal: PendingDeal }) {
  const t = useTranslations("talents.space.dashboard.deals");
  const [state, action, pending] = useActionState<DealDecisionState, FormData>(
    decideDeal,
    undefined
  );

  if (state?.ok) {
    return (
      <li role="status" className="rounded-sedan border border-border bg-surface p-4 text-sm">
        {state.decision === "accept" ? t("accepted") : t("declined")}
      </li>
    );
  }

  return (
    <li className="space-y-3 rounded-sedan border border-border bg-surface p-4">
      <div>
        <p className="font-medium">{deal.task || t("untitled")}</p>
        {deal.terms && (
          <p className="mt-1 whitespace-pre-line text-sm text-fg-muted">{deal.terms}</p>
        )}
        {deal.dealDocUrl && (
          <a
            href={deal.dealDocUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm text-accent underline-offset-4 hover:underline"
          >
            <FileText className="size-4" /> {t("openDoc")}
          </a>
        )}
      </div>
      <form action={action} className="space-y-2">
        <input type="hidden" name="taskId" value={deal.taskId} />
        <label className="block text-sm text-fg-muted">
          {t("commentLabel")}
          <textarea
            name="comment"
            maxLength={1000}
            rows={2}
            className="mt-1 w-full rounded-md border border-border bg-bg p-2 text-sm text-fg"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="decision" value="accept" size="sm" disabled={pending}>
            <Check /> {t("accept")}
          </Button>
          <Button type="submit" name="decision" value="deny" size="sm" variant="outline" disabled={pending}>
            <X /> {t("decline")}
          </Button>
        </div>
        {state && !state.ok && <ActionErrorMessage error={state.error} />}
      </form>
    </li>
  );
}

export function DealsPanel({ deals }: { deals: PendingDeal[] }) {
  const t = useTranslations("talents.space.dashboard.deals");
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-medium">{t("title")}</h2>
      <p className="text-sm text-fg-muted">{t("intro")}</p>
      {deals.length === 0 ? (
        <p className="rounded-sedan border border-dashed border-border bg-surface-2/40 p-6 text-sm text-fg-muted">
          {t("empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {deals.map((d) => (
            <DealCard key={d.taskId} deal={d} />
          ))}
        </ul>
      )}
    </section>
  );
}
