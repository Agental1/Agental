"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ActionErrorMessage } from "@/components/app/action-error";
import type { ActionError } from "@/domain/action-result";
import { discardDraft, extractOneGo, saveReview, type ChatView } from "@/app/actions/onboarding-chat";
import { VoiceButton } from "./voice-button";
import { err } from "@/domain/action-result";
import { ONE_GO_MAX } from "@/domain/onboarding-chat";

/**
 * "Tell us about yourself in one go" (round 12, group 6): one text (typed,
 * pasted or spoken), one model call, then a review listing every field it
 * understood. Nothing is saved until "Save these answers"; Discard empties the
 * draft. Only shown while the model is on.
 */
export function OneGo({ review, onChange, onSaved }: { review: ChatView["review"]; onChange: (view: ChatView) => void; onSaved: () => void }) {
  const t = useTranslations("talents");
  const c = "onboarding.chat" as const;
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Record<string, string>>(() => Object.fromEntries((review?.rows ?? []).map((r) => [r.field, r.text])));
  const [error, setError] = useState<ActionError | undefined>();
  const [pending, start] = useTransition();
  const cities = review?.cities ?? [];

  if (!review) {
    return (
      <section className="space-y-3 rounded-sedan border border-border bg-surface p-4" aria-labelledby="one-go">
        <h2 id="one-go" className="font-medium">{t(`${c}.oneGo.title`)}</h2>
        <p className="text-sm text-fg-muted">{t(`${c}.oneGo.hint`)}</p>
        <textarea
          className="min-h-28 w-full rounded-sedan border border-border bg-bg p-3 text-[15px]"
          maxLength={ONE_GO_MAX}
          value={text}
          placeholder={t(`${c}.oneGo.placeholder`)}
          onChange={(e) => setText(e.target.value)}
          aria-label={t(`${c}.oneGo.title`)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <VoiceButton onText={(s) => setText((p) => `${p} ${s}`.trim())} disabled={pending} />
          <Button
            disabled={pending || !text.trim()}
            onClick={() =>
              start(async () => {
                setError(undefined);
                const res = await extractOneGo(text).catch(() => null);
                if (!res || !res.ok) return setError(err("errors.generic"));
                setRows(Object.fromEntries((res.view.review?.rows ?? []).map((r) => [r.field, r.text])));
                onChange(res.view);
              })
            }
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {pending ? t(`${c}.oneGo.working`) : t(`${c}.oneGo.button`)}
          </Button>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{t(`${c}.oneGo.error`)}</p>}
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-sedan border border-border bg-surface p-4" aria-labelledby="one-go-review">
      <h2 id="one-go-review" className="font-medium">{t(`${c}.oneGo.reviewTitle`)}</h2>
      <p className="text-sm text-fg-muted">{t(`${c}.oneGo.reviewHint`)}</p>
      {review.rows.map((r) => (
        <div key={r.field} className="space-y-1">
          <Label htmlFor={`og-${r.field}`}>{t(`${c}.fields.${r.field}` as `${typeof c}.fields.city`)}</Label>
          {r.field === "city" ? (
            <select id={`og-city`} className="h-11 w-full rounded-sedan border border-border bg-bg px-3" value={rows.city ?? ""} onChange={(e) => setRows((p) => ({ ...p, city: e.target.value }))}>
              <option value="">{t(`${c}.oneGo.cityHint`)}</option>
              {cities.map((x) => <option key={x.geonameId} value={String(x.geonameId)}>{x.label}</option>)}
            </select>
          ) : (
            <Input id={`og-${r.field}`} value={rows[r.field] ?? ""} onChange={(e) => setRows((p) => ({ ...p, [r.field]: e.target.value }))} />
          )}
        </div>
      ))}
      <ActionErrorMessage error={error} />
      <div className="flex gap-3">
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(undefined);
              const res = await saveReview(Object.entries(rows).map(([field, value]) => ({ field, text: value }))).catch(() => null);
              if (!res) return setError(err("errors.generic"));
              if (!res.ok) return setError(res.error);
              onSaved();
            })
          }
        >
          {t(`${c}.oneGo.save`)}
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await discardDraft().catch(() => null);
              setRows({});
              onSaved();
            })
          }
        >
          {t(`${c}.oneGo.discard`)}
        </Button>
      </div>
    </section>
  );
}
