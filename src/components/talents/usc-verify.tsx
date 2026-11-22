"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ActionErrorMessage } from "@/components/app/action-error";
import { sendUscCodeAction, verifyUscCodeAction } from "@/app/actions/checkout";
import { err, type ActionError } from "@/domain/action-result";
import { CODE_RESEND_MS, isUscEmail } from "@/domain/promo-verification";

export interface UscVerified {
  at: string;
  email: string;
}

/**
 * The two USC steps (round 8b), shared by the plan checkout panel and the
 * Limelight request: a @usc.edu address and "Send the code", then the
 * 6-digit code in six boxes. Codes last 10 minutes, allow 5 tries and can be
 * resent after 60 seconds (checked on the server).
 */
export function UscVerifySteps({ onVerified }: { onVerified: (v: UscVerified) => void }) {
  const t = useTranslations("talents.checkout.usc");
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<ActionError | undefined>();
  const [pending, start] = useTransition();
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const router = useRouter();

  // The resend countdown.
  useEffect(() => {
    if (!sentAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sentAt]);
  const wait = sentAt ? Math.max(0, Math.ceil((sentAt + CODE_RESEND_MS - now) / 1000)) : 0;

  function send() {
    setError(undefined);
    if (!isUscEmail(email)) return setError(err("errors.uscEmailOnly"));
    start(async () => {
      const res = await sendUscCodeAction(email);
      if (!res.ok) {
        setError(res.error);
        // A code went out a moment ago: let them type it.
        if (res.codePending) setStep("code");
        return;
      }
      if (res.alreadyVerified) {
        router.refresh();
        return onVerified({ at: res.verifiedAt ?? new Date().toISOString(), email: res.email ?? email });
      }
      setSentAt(Date.now());
      setNow(Date.now());
      setCode("");
      setStep("code");
    });
  }

  function verify(value = code) {
    setError(undefined);
    if (value.length !== 6) return;
    start(async () => {
      const res = await verifyUscCodeAction(value);
      if (!res.ok) {
        setCode("");
        return setError(res.error);
      }
      router.refresh();
      onVerified({ at: res.verifiedAt ?? new Date().toISOString(), email: res.email ?? email });
    });
  }

  if (step === "email") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="space-y-3"
        noValidate
      >
        <label htmlFor="usc-email" className="block text-[15px] font-medium">
          {t("emailLead")}
        </label>
        <Input
          id="usc-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
        <ActionErrorMessage error={error} />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" loading={pending}>
            {t("send")}
          </Button>
          {/* A code from a moment ago, after the panel was closed. */}
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setError(undefined);
              setStep("code");
            }}
          >
            {t("haveCode")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <p id="usc-code-label" className="text-[15px] font-medium">
        {email.trim() ? t("codeLead", { email: email.trim().toLowerCase() }) : t("codeLeadNoEmail")}
      </p>
      <InputOTP
        maxLength={6}
        value={code}
        onChange={(v) => setCode(v.replace(/\D/g, ""))}
        onComplete={(v: string) => verify(v)}
        inputMode="numeric"
        pattern="^[0-9]*$"
        autoFocus
        aria-labelledby="usc-code-label"
        aria-invalid={error ? true : undefined}
        disabled={pending}
      >
        <InputOTPGroup className="gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <InputOTPSlot
              key={i}
              index={i}
              className="size-12 rounded-sedan border border-field bg-surface text-xl font-bold first:rounded-sedan last:rounded-sedan"
            />
          ))}
        </InputOTPGroup>
      </InputOTP>
      <ActionErrorMessage error={error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => verify()} loading={pending} disabled={code.length !== 6}>
          {t("verify")}
        </Button>
        <Button variant="ghost" onClick={send} disabled={pending || wait > 0 || !isUscEmail(email)}>
          {wait > 0 ? t("resendIn", { seconds: wait }) : t("resend")}
        </Button>
        <Button
          variant="link"
          onClick={() => {
            setStep("email");
            setError(undefined);
          }}
        >
          {t("otherEmail")}
        </Button>
      </div>
      <p className="text-[13px] text-fg-muted">{t("codeHint")}</p>
    </div>
  );
}
