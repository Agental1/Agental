"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Send } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ActionErrorMessage } from "@/components/app/action-error";
import type { ActionError } from "@/domain/action-result";
import { err } from "@/domain/action-result";
import { optionKey } from "@/domain/identity";
import { cn } from "@/lib/utils";
import { chatState, chatTurn, confirmPending, pickCity, type ChatReply, type ChatScope, type ChatView } from "@/app/actions/onboarding-chat";
import { VoiceButton } from "./voice-button";
import { OneGo } from "./one-go-review";

/**
 * Round 12, group 6: the onboarding chat (docs/ONBOARDING_CHAT_DESIGN.md).
 * One question at a time, in the order of what is still missing. Chips for
 * every enum, a Skip chip on every question, a visible "Switch to the form"
 * at all times. Everything is read and saved on the server; nothing is kept
 * in browser storage.
 */
type Line = { from: "agent" | "you"; text: string };

export function OnboardingChat({
  scope,
  onSwitchToForm,
  onDone,
  className,
}: {
  scope: ChatScope;
  /** Switch to the form: the parent reloads the form with what is saved. */
  onSwitchToForm: () => void;
  /** Onboarding: the chat has asked everything it had to; go on to the next screen. */
  onDone?: (view: ChatView) => void;
  className?: string;
}) {
  const t = useTranslations("talents");
  const c = "onboarding.chat" as const;
  const [view, setView] = useState<ChatView | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [multi, setMulti] = useState<string[]>([]);
  const [error, setError] = useState<ActionError | undefined>();
  const [stopped, setStopped] = useState(false);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const asked = useRef<string | null>(null);

  const label = useCallback(
    (field: string, value: string): string => {
      const pe = "space.profileEditor" as const;
      const tryKey = (key: string) => (t.has(key as never) ? t(key as never) : null);
      switch (field) {
        case "gender": return tryKey(`${pe}.genders.${value}`) ?? value;
        case "build": case "hair": case "eyes": return tryKey(`${pe}.options.${optionKey(value)}`) ?? value;
        case "compensation": return tryKey(`${pe}.prefs.compensationLabels.${value}`) ?? value;
        case "workTypes": return tryKey(`${pe}.prefs.projectTypeLabels.${value}`) ?? value;
        default: return value;
      }
    },
    [t]
  );

  const say = useCallback((from: Line["from"], s: string) => setLines((l) => [...l, { from, text: s }]), []);

  const questionText = useCallback((v: ChatView) => (v.question ? t(`${c}.questions.${v.question.id}` as `${typeof c}.questions.city`) : ""), [t]);

  // Ask the question the server says is next, once per question.
  const announce = useCallback(
    (v: ChatView) => {
      if (v.question && asked.current !== v.question.id) {
        asked.current = v.question.id;
        say("agent", questionText(v));
      }
    },
    [say, questionText]
  );

  useEffect(() => {
    let live = true;
    chatState(scope).then((v) => {
      if (!live || !v) return;
      setView(v);
      setLines([{ from: "agent", text: t(`${c}.intro`, { agent: v.agentName }) }]);
      announce(v);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "nearest" });
  }, [lines, view]);

  function apply(res: ChatReply | { status: "error"; error: ReturnType<typeof err> }) {
    if (res.status === "error" && !("view" in res)) {
      setError(res.error);
      return;
    }
    const r = res as ChatReply;
    setError(undefined);
    if (r.reaction) say("agent", r.reaction);
    else if (r.reactionKey) say("agent", t(`${c}.${r.reactionKey}` as `${typeof c}.reactions.a`));
    if (r.error && r.status !== "retry") setError(r.error);
    setView(r.view);
    setText("");
    setMulti([]);
    if (r.status === "minor") return setStopped(true);
    if (r.status === "fallback") asked.current = null;
    if (r.status === "saved" || r.status === "skipped") announce(r.view);
    if (r.status === "retry" && r.view.question) say("agent", questionText(r.view));
  }

  function run(job: () => Promise<ChatReply | { status: "error"; error: ReturnType<typeof err> }>) {
    start(async () => {
      try {
        apply(await job());
      } catch {
        setError(err("errors.generic"));
      }
    });
  }

  const q = view?.question ?? null;

  if (!view) return <div className={cn("p-6", className)}><Loader2 className="size-5 animate-spin" aria-label={t(`${c}.thinking`)} /></div>;

  const switchLink = (
    <Button type="button" variant="link" size="sm" onClick={onSwitchToForm}>
      {t(`${c}.switchToForm`)}
    </Button>
  );

  return (
    <div className={cn("mx-auto w-full max-w-2xl space-y-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-medium">{t(`${c}.talkingTo`, { agent: view.agentName })}</h2>
        {switchLink}
      </div>

      <div role="log" aria-live="polite" className="max-h-[50vh] space-y-3 overflow-y-auto rounded-sedan border border-border bg-surface p-4">
        {lines.map((l, i) => (
          <p key={i} className={cn("max-w-[85%] rounded-sedan px-3 py-2 text-[15px]", l.from === "agent" ? "bg-surface-2" : "ml-auto bg-accent-soft")}>
            <span className="sr-only">{l.from === "agent" ? view.agentName : t(`${c}.you`)}: </span>
            {l.text}
          </p>
        ))}
        <div ref={end} />
      </div>

      <ActionErrorMessage error={error} />

      {stopped && (
        <div className="space-y-2">
          <p className="text-sm">{t(`${c}.stopped`)}</p>
          {switchLink}
        </div>
      )}

      {!stopped && view.pending && (
        <div className="space-y-2">
          <p className="text-[15px]">{t(`${c}.confirmAsk`, { value: view.pending.text })}</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => run(() => confirmPending(true, scope))}>{t(`${c}.confirmYes`)}</Button>
            <Button variant="outline" disabled={pending} onClick={() => run(() => confirmPending(false, scope))}>{t(`${c}.confirmNo`)}</Button>
          </div>
        </div>
      )}

      {!stopped && !view.pending && q && (
        <div className="space-y-3">
          {view.cities.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label={t(`${c}.pickCity`)}>
              {view.cities.map((x) => (
                <Button key={x.geonameId} variant="outline" size="sm" disabled={pending} onClick={() => run(() => pickCity(x.geonameId, scope))}>
                  {x.label}
                </Button>
              ))}
            </div>
          )}

          {(q.kind === "chips" || q.kind === "multi") && (
            <div className="flex flex-wrap gap-2" role="group" aria-label={questionText(view)}>
              {q.options.map((o) => {
                const on = multi.includes(o);
                return (
                  <Button
                    key={o}
                    variant={on ? "primary" : "outline"}
                    size="sm"
                    aria-pressed={q.kind === "multi" ? on : undefined}
                    disabled={pending}
                    onClick={() => (q.kind === "multi" ? setMulti((m) => (on ? m.filter((x) => x !== o) : [...m, o])) : run(() => chatTurn({ scope, field: q.id, kind: "chip", answer: o })))}
                  >
                    {label(q.id, o)}
                  </Button>
                );
              })}
              {q.kind === "multi" && multi.length > 0 && (
                <Button size="sm" disabled={pending} onClick={() => run(() => chatTurn({ scope, field: q.id, kind: "chip", answer: multi }))}>
                  {t(`${c}.send`)}
                </Button>
              )}
            </div>
          )}

          {q.kind === "text" && (
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!text.trim()) return;
                say("you", text.trim());
                run(() => chatTurn({ scope, field: q.id, kind: "text", answer: text }));
              }}
            >
              <textarea
                className="min-h-11 flex-1 rounded-sedan border border-border bg-bg px-3 py-2 text-[15px]"
                rows={q.id === "bio" ? 4 : 1}
                maxLength={q.id === "bio" ? 5000 : 1500}
                value={text}
                placeholder={t(`${c}.placeholder`)}
                aria-label={t(`${c}.placeholder`)}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && q.id !== "bio") e.currentTarget.form?.requestSubmit();
                }}
              />
              <Button type="submit" disabled={pending || !text.trim()} aria-label={t(`${c}.send`)}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Send />}
              </Button>
            </form>
          )}
          {q.kind === "text" && <VoiceButton onText={(s) => setText((p) => `${p} ${s}`.trim())} disabled={pending} />}

          <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => chatTurn({ scope, field: q.id, kind: "skip" }))}>
            {t(`${c}.skip`)}
          </Button>
        </div>
      )}

      {!stopped && view.done && (
        <div className="space-y-3 rounded-sedan border border-border bg-surface p-4">
          <h3 className="font-medium">{t(`${c}.doneTitle`)}</h3>
          <p className="text-sm text-fg-muted">{t(`${c}.doneBody`)}</p>
          {scope === "profile" && view.photosMissing && (
            <p className="text-sm">
              {t(`${c}.photosBody`)}{" "}
              <Link href="/talents/app/profil?tab=media" className="font-bold text-accent hover:underline">{t(`${c}.photosButton`)}</Link>
            </p>
          )}
          {view.leftForForm.length > 0 && (
            <div className="space-y-1 text-sm">
              <p>{t(`${c}.leftForForm`)}</p>
              <ul className="list-disc pl-5">
                {view.leftForForm.map((f) => <li key={f}>{t(`${c}.fields.${f}` as `${typeof c}.fields.city`)}</li>)}
              </ul>
              {switchLink}
            </div>
          )}
          {onDone && <Button onClick={() => onDone(view)}>{t(`${c}.doneContinue`)}</Button>}
        </div>
      )}

      {!stopped && scope === "profile" && view.mode === "model" && (
        <OneGo
          key={view.review ? "review" : "ask"}
          review={view.review}
          onChange={setView}
          onSaved={() => chatState(scope).then((v) => v && (asked.current = null, setView(v), announce(v)))}
        />
      )}
    </div>
  );
}
