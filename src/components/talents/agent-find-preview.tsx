"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAMES = ["samantha", "adrian"] as const;
const HELPS = ["roles", "profile", "selftape", "draft"] as const;
type Name = (typeof NAMES)[number];
type Help = (typeof HELPS)[number];

/**
 * Agental Find, as a clickable preview at the top of Messages.
 *
 * PREVIEW ONLY. Every choice lives in this component's state and disappears
 * on reload. There are no preference writes, no model or API calls, no tools,
 * webhooks, workflow runs, background jobs, casting research, application
 * actions or emails, and zero model tokens: the sample text is fixed copy in
 * the message files. "Save agent preferences" shows a local confirmation.
 *
 * When the real assistant is built, its server logic goes in
 * `src/lib/assistant/` and its route in `src/app/api/assistant/` (both empty
 * today); this component would then call that route instead of setting local
 * state. See docs/HANDOFF.md.
 */
export function AgentFindPreview() {
  const t = useTranslations("talents.space.find");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState<Name | null>(null);
  const [helps, setHelps] = useState<Help[]>([]);
  const [saved, setSaved] = useState(false);

  const steps = [t("steps.name"), t("steps.help"), t("steps.review")];
  const canNext = step === 0 ? name !== null : step === 1 ? helps.length > 0 : true;

  function toggle(help: Help) {
    setSaved(false);
    setHelps((h) => (h.includes(help) ? h.filter((x) => x !== help) : [...h, help]));
  }

  function restart() {
    setStep(0);
    setName(null);
    setHelps([]);
    setSaved(false);
  }

  return (
    <section
      aria-labelledby="find-title"
      className="accent-wash rounded-sedan-xl border border-accent/50 bg-surface p-[clamp(16px,2.4vw,28px)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Sparkles aria-hidden="true" className="mt-1 size-5 shrink-0 text-accent" />
          <div>
            <h2 id="find-title" className="text-[1.25rem] leading-snug">
              {t("intro")}
            </h2>
            <p className="mt-1 max-w-[62ch] text-[15px] text-fg-muted">{t("explain")}</p>
          </div>
        </div>
        <span className="rounded-full border border-accent px-3 py-1 text-[13px] font-bold text-accent">
          {t("previewOnly")}
        </span>
      </div>

      {!open ? (
        <Button className="mt-4" onClick={() => setOpen(true)}>
          {t("start")}
        </Button>
      ) : (
        <div className="mt-5">
          <ol aria-label={t("previewOnly")} className="flex flex-wrap gap-2">
            {steps.map((label, i) => (
              <li
                key={label}
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1.5 text-[13.5px] font-bold",
                  i === step ? "bg-accent text-accent-fg" : i < step ? "bg-accent-soft text-accent" : "bg-surface-2 text-fg-muted"
                )}
              >
                <span className="tabular-nums">{i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          <p className="sr-only" aria-live="polite">
            {t("stepOf", { n: step + 1, total: steps.length })}
          </p>

          <div className="enter mt-4" key={step}>
            {step === 0 && (
              <fieldset>
                <legend className="text-[15px] text-fg-muted">{t("nameLead")}</legend>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {NAMES.map((n) => (
                    <label
                      key={n}
                      className={cn(
                        "pressable flex cursor-pointer items-center gap-3 rounded-sedan-lg border bg-surface px-4 py-3 [--hover-scale:1.015] [--press-scale:1.03] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)]",
                        name === n ? "border-accent" : "border-border"
                      )}
                    >
                      <input
                        type="radio"
                        name="find-name"
                        checked={name === n}
                        onChange={() => {
                          setName(n);
                          setSaved(false);
                        }}
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--blue),var(--blue-lift))] font-bold text-white"
                      >
                        {t(`names.${n}`)[0]}
                      </span>
                      <span className="flex-1 text-[1.0625rem] font-bold">{t(`names.${n}`)}</span>
                      {name === n && <Check aria-hidden="true" className="size-5 text-accent" />}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {step === 1 && (
              <fieldset>
                <legend className="text-[15px] text-fg-muted">{t("helpLead")}</legend>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {HELPS.map((h) => {
                    const on = helps.includes(h);
                    return (
                      <label
                        key={h}
                        className={cn(
                          "pressable flex cursor-pointer items-start gap-3 rounded-sedan-lg border bg-surface px-4 py-3 [--hover-scale:1.01] [--press-scale:1.02] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)]",
                          on ? "border-accent" : "border-border"
                        )}
                      >
                        <input type="checkbox" checked={on} onChange={() => toggle(h)} className="sr-only" />
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2",
                            on ? "border-accent bg-accent text-accent-fg" : "border-border-strong"
                          )}
                        >
                          {on && <Check className="size-3" strokeWidth={3} />}
                        </span>
                        <span className="block">
                          <span className="block font-bold leading-snug">{t(`helps.${h}.title`)}</span>
                          <span className="mt-0.5 block text-[14px] leading-snug text-fg-muted">
                            {t(`helps.${h}.sample`)}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {step === 2 && (
              <div>
                <p className="text-[15px] text-fg-muted">{t("reviewLead")}</p>
                <dl className="mt-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-sedan-lg border border-border bg-surface px-4 py-3">
                    <div>
                      <dt className="text-[13px] text-fg-muted">{t("assistant")}</dt>
                      <dd className="font-bold">{name ? t(`names.${name}`) : t("none")}</dd>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(0)}
                      className="inline-flex min-h-11 items-center text-[14px] font-bold text-accent underline-offset-4 hover:underline"
                    >
                      {t("edit")}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-start justify-between gap-3 rounded-sedan-lg border border-border bg-surface px-4 py-3">
                    <div>
                      <dt className="text-[13px] text-fg-muted">{t("helpWith")}</dt>
                      <dd>
                        {helps.length === 0 ? (
                          <span className="font-bold">{t("none")}</span>
                        ) : (
                          <ul className="mt-1 space-y-0.5">
                            {helps.map((h) => (
                              <li key={h} className="font-bold">
                                {t(`helps.${h}.title`)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </dd>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="inline-flex min-h-11 items-center text-[14px] font-bold text-accent underline-offset-4 hover:underline"
                    >
                      {t("edit")}
                    </button>
                  </div>
                </dl>
                <p role="status" className="mt-3 min-h-5 text-[15px] font-bold text-success">
                  {saved ? t("saved") : ""}
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {step > 0 && (
              <Button variant="secondary" className="border-border-strong" onClick={() => setStep(step - 1)}>
                {t("back")}
              </Button>
            )}
            {step < 2 ? (
              <Button disabled={!canNext} onClick={() => setStep(step + 1)}>
                {t("next")}
              </Button>
            ) : (
              <>
                {/* Local only: no request leaves the browser. */}
                <Button onClick={() => setSaved(true)}>{t("save")}</Button>
                <Button variant="ghost" onClick={restart}>
                  {t("restart")}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
