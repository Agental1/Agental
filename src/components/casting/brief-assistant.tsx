"use client";

import { useTranslations } from "next-intl";
import { useActionErrorText } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";
import { useState, useTransition } from "react";
import { Sparkles, Send, Loader2, ArrowRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BRIEF_QUESTIONS, type BriefAnswers } from "@/lib/ai/brief-assistant";
import { createBrief } from "@/app/actions/brief";

export function BriefAssistant() {
  const t = useTranslations("casting");
  const errorText = useActionErrorText();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<BriefAnswers>({});
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ error: ActionError; upgrade?: boolean }>();

  const q = BRIEF_QUESTIONS[step];
  const done = step >= BRIEF_QUESTIONS.length;

  function answer(v: string) {
    const next = { ...answers, [q.key]: v };
    setAnswers(next);
    setValue("");
    if (step + 1 >= BRIEF_QUESTIONS.length) {
      submit(next);
    } else {
      setStep(step + 1);
    }
  }

  function submit(final: BriefAnswers) {
    setStep(BRIEF_QUESTIONS.length);
    startTransition(async () => {
      const res = await createBrief(final);
      // On success createBrief redirects; only errors return here.
      if (res && !res.ok) {
        setError({ error: res.error ?? err("errors.generic"), upgrade: res.upgrade });
        setStep(BRIEF_QUESTIONS.length - 1);
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="space-y-4 rounded-sedan border border-border bg-surface p-5">
        {/* Transcript */}
        <div className="space-y-3">
          {BRIEF_QUESTIONS.slice(0, step + (done ? 0 : 1)).map((question) => (
            <div key={question.key} className="space-y-2">
              <Bubble role="assistant">
                {t(`space.brief.questions.${question.key}.prompt`)}
              </Bubble>
              {answers[question.key as keyof BriefAnswers] && (
                <Bubble role="user">
                  {answers[question.key as keyof BriefAnswers]}
                </Bubble>
              )}
            </div>
          ))}
          {done && !error && (
            <Bubble role="assistant">
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />{t("space.brief.working")}</span>
            </Bubble>
          )}
        </div>

        {error && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-sedan p-3 text-sm",
              error.upgrade ? "bg-accent-soft text-accent" : "bg-danger/10 text-danger"
            )}
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{errorText(error.error)}</span>
          </div>
        )}

        {/* Current input */}
        {!done && (
          <div className="border-t border-border pt-4">
            {q.kind === "choice" ? (
              <div className="flex flex-wrap gap-2">
                {q.options!.map((opt) => (
                  <Button key={opt} variant="outline" onClick={() => answer(opt)}>
                    {t(
                      `space.brief.genderOptions.${opt}` as "space.brief.genderOptions.H"
                    )}
                  </Button>
                ))}
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (value.trim() || q.optional) answer(value.trim());
                }}
                className="flex gap-2"
              >
                <Input
                  autoFocus
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={
                    q.key === "gender"
                      ? undefined
                      : t(`space.brief.questions.${q.key}.placeholder`)
                  }
                  type={q.kind === "number" ? "number" : "text"}
                />
                <Button type="submit" disabled={pending}>
                  {q.optional && !value.trim() ? t("space.brief.skip") : <Send className="size-4" />}
                </Button>
              </form>
            )}
          </div>
        )}
      </div>

      <p className="mt-3 flex items-center gap-2 text-xs text-fg-subtle">
        <Sparkles className="size-3.5 text-accent" />
        {t("space.brief.introA")} <ArrowRight className="size-3" />{" "}
        {t("space.brief.introB")}
      </p>
    </div>
  );
}

function Bubble({
  role,
  children,
}: {
  role: "assistant" | "user";
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex", role === "user" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-sedan px-3 py-2 text-sm",
          role === "user"
            ? "bg-accent text-accent-fg"
            : "bg-surface-2 text-fg"
        )}
      >
        {children}
      </div>
    </div>
  );
}
