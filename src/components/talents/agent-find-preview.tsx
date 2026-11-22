"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, PenLine, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionErrorMessage } from "@/components/app/action-error";
import { saveAgentSetup } from "@/app/actions/agent-setup";
import {
  AGENT_CUSTOM_NAME_MAX,
  AGENT_HELPS,
  AGENT_NAMES,
  type AgentHelp,
  type AgentNameChoice,
  type AgentSetup,
} from "@/domain/agent-setup";
import type { ActionError } from "@/domain/action-result";
import { cn } from "@/lib/utils";

/**
 * The AI agent setup at the top of Messages (round 8b): name (Samantha,
 * Adrian or a custom name), what it should help with, then Save, which stores
 * the choices on the account. Once saved, the big card gives way to one small
 * "Edit your AI agent" line that reopens the setup with the saved values.
 *
 * The agent itself is not live (round 9): saving calls no model, workflow or
 * email. When it is built, its server logic goes in `src/lib/assistant/` and
 * reads these choices from ArtistProfile.agent*.
 */
export function AgentFindPreview({ saved: initial }: { saved: AgentSetup | null }) {
  const t = useTranslations("talents.space.find");
  const [saved, setSaved] = useState<AgentSetup | null>(initial);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState<AgentNameChoice | null>(initial?.name ?? null);
  const [customName, setCustomName] = useState(initial?.customName ?? "");
  const [helps, setHelps] = useState<AgentHelp[]>(initial?.helps ?? []);
  const [error, setError] = useState<ActionError | undefined>();
  const [pending, startTransition] = useTransition();

  const steps = [t("steps.name"), t("steps.help"), t("steps.review")];
  const nameOk = name !== null && (name !== "custom" || customName.trim().length > 0);
  const canNext = step === 0 ? nameOk : step === 1 ? helps.length > 0 : true;
  const nameLabel = (n: AgentNameChoice | null, custom: string | null) =>
    n === "custom" ? (custom ?? "").trim() || t("none") : n ? t(`names.${n}`) : t("none");

  function toggle(help: Help) {
    setHelps((h) => (h.includes(help) ? h.filter((x) => x !== help) : [...h, help]));
  }

  function reopen() {
    setName(saved?.name ?? null);
    setCustomName(saved?.customName ?? "");
    setHelps(saved?.helps ?? []);
    setStep(0);
    setError(undefined);
    setOpen(true);
  }

  function save() {
    if (!name) return;
    setError(undefined);
    startTransition(async () => {
      const res = await saveAgentSetup({ name, customName: name === "custom" ? customName : undefined, helps });
      if (!res.ok) return setError(res.error);
      setSaved({ name, customName: name === "custom" ? customName.trim() : null, helps });
      setOpen(false);
    });
  }

  // Saved and closed: one small line at the top of Messages.
  if (saved && !open) {
    return (
      <button
        type="button"
        onClick={reopen}
        className="pressable inline-flex min-h-11 items-center gap-2 rounded-full border border-accent/50 bg-surface px-4 text-[14.5px] font-bold text-accent [--hover-scale:1.02]"
      >
        <Sparkles aria-hidden="true" className="size-4" />
        {t("editAgent")}
        <span className="font-normal text-fg-muted">· {nameLabel(saved.name, saved.customName)}</span>
        <PenLine aria-hidden="true" className="size-4" />
      </button>
    );
  }

  return (
    <section
      aria-labelledby="find-title"
      className="accent-wash rounded-sedan-xl border border-accent/50 bg-surface p-[clamp(16px,2.4vw,28px)]"
    >
      <div className="flex items-start gap-3">
        <Sparkles aria-hidden="true" className="mt-1 size-5 shrink-0 text-accent" />
        <div>
          <h2 id="find-title" className="text-[1.25rem] leading-snug">
            {saved ? t("editAgent") : t("intro")}
          </h2>
          <p className="mt-1 max-w-[62ch] text-[15px] text-fg-muted">{t("explain")}</p>
        </div>
      </div>

      {!open ? (
        <Button className="mt-4" onClick={reopen}>
          {t("start")}
        </Button>
      ) : (
        <div className="mt-5">
          <ol aria-label={t("stepsLabel")} className="flex flex-wrap gap-2">
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
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {AGENT_NAMES.map((n) => (
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
                        onChange={() => setName(n)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--blue),var(--blue-lift))] font-bold text-white"
                      >
                        {n === "custom" ? <PenLine className="size-4" /> : t(`names.${n}`)[0]}
                      </span>
                      <span className="flex-1 text-[1.0625rem] font-bold">{t(`names.${n}`)}</span>
                      {name === n && <Check aria-hidden="true" className="size-5 text-accent" />}
                    </label>
                  ))}
                </div>
                {name === "custom" && (
                  <div className="mt-3 max-w-sm space-y-1.5">
                    <label htmlFor="find-custom-name" className="text-[14px] font-bold">
                      {t("customLabel")}
                    </label>
                    <Input
                      id="find-custom-name"
                      autoFocus
                      maxLength={AGENT_CUSTOM_NAME_MAX}
                      value={customName}
                      placeholder={t("customPlaceholder")}
                      onChange={(ev) => setCustomName(ev.target.value)}
                    />
                  </div>
                )}
              </fieldset>
            )}

            {step === 1 && (
              <fieldset>
                <legend className="text-[15px] text-fg-muted">{t("helpLead")}</legend>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {AGENT_HELPS.map((h) => {
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
                      <dd className="font-bold">{nameLabel(name, customName)}</dd>
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
                <ActionErrorMessage error={error} className="mt-3" />
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
              <Button loading={pending} disabled={!nameOk || helps.length === 0} onClick={save}>
                {t("save")}
              </Button>
            )}
            {saved && (
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t("cancel")}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

type Help = AgentHelp;
