"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { MailWarning } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { confirmMyEmailCode, sendMyEmailCode } from "@/app/actions/account-email";
import { logoutAction } from "@/app/actions/auth";
import { ActionErrorMessage } from "@/components/app/action-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { err, type ActionError } from "@/domain/action-result";

const RESEND_SECONDS = 60;

/**
 * Round 10: "Enter the 6-digit code we sent to <email>". Six boxes (pasting a
 * whole code fills them), checked as soon as the sixth digit is in, a new code
 * after 60 seconds. Used on the screen after sign-up and in the banner's dialog.
 */
export function EmailCodeForm({
  email,
  sendOnMount = false,
  onVerified,
}: {
  email: string;
  /** The banner sends the first code when the dialog opens; sign-up already sent it. */
  sendOnMount?: boolean;
  onVerified: () => void;
}) {
  const t = useTranslations("common.emailFlow");
  const [code, setCode] = useState("");
  const [error, setError] = useState<ActionError | undefined>();
  const [cooldown, setCooldown] = useState(sendOnMount ? 0 : RESEND_SECONDS);
  const [notice, setNotice] = useState<string>("");
  const [pending, start] = useTransition();
  const sentOnce = useRef(false);
  const boxes = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  function send() {
    setError(undefined);
    setNotice("");
    start(async () => {
      const res = await sendMyEmailCode().catch(() => ({ ok: false as const, error: err("errors.generic") }));
      if (res.ok && res.alreadyVerified) return onVerified();
      if (res.ok) {
        setNotice(t("codeSent", { email }));
        setCooldown(RESEND_SECONDS);
        return;
      }
      setError(res.error);
      if ("codePending" in res && res.codePending) setCooldown(RESEND_SECONDS);
    });
  }

  useEffect(() => {
    if (sendOnMount && !sentOnce.current) {
      sentOnce.current = true;
      send();
    }
    // Once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function verify(value = code) {
    if (value.length !== 6) return;
    setError(undefined);
    start(async () => {
      const res = await confirmMyEmailCode(value).catch(() => ({ ok: false as const, error: err("errors.generic") }));
      if (res.ok) return onVerified();
      setError(res.error);
      setCode("");
      // Back in the boxes for the next try.
      window.setTimeout(() => boxes.current?.focus(), 0);
    });
  }

  return (
    <div className="space-y-4">
      <p id="email-code-label" className="text-[15px] text-fg-muted">
        {t("codeLead", { email })}
      </p>
      <InputOTP
        ref={boxes}
        maxLength={6}
        value={code}
        onChange={(v) => setCode(v.replace(/\D/g, ""))}
        onComplete={(v: string) => verify(v)}
        inputMode="numeric"
        pattern="^[0-9]*$"
        autoFocus
        autoComplete="one-time-code"
        aria-labelledby="email-code-label"
        aria-invalid={error ? true : undefined}
        disabled={pending}
        containerClassName="justify-center"
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
      <p role="status" className="min-h-5 text-[14px] text-success">{notice}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => verify()} loading={pending} disabled={code.length !== 6}>
          {t("codeVerify")}
        </Button>
        <button
          type="button"
          disabled={pending || cooldown > 0}
          onClick={send}
          className="inline-flex min-h-11 items-center text-[14.5px] font-bold text-accent underline-offset-4 hover:underline disabled:text-fg-muted disabled:no-underline"
        >
          {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("codeResend")}
        </button>
      </div>
      <p className="text-xs text-fg-muted">{t("codeExpiry")}</p>
    </div>
  );
}

/** The screen right after a password sign-up (/verifier without a token). */
export function EmailCodeScreen({ email, next, liveCode }: { email: string; next: string; liveCode: boolean }) {
  const t = useTranslations("common.emailFlow");
  const router = useRouter();
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl">{t("codeTitle")}</h1>
      </div>
      {/* Coming back later with no live code: a new one goes out at once. */}
      <EmailCodeForm email={email} sendOnMount={!liveCode} onVerified={() => router.replace(next)} />
      <form action={logoutAction} className="text-center">
        <button
          type="submit"
          className="inline-flex min-h-11 items-center text-[14.5px] font-bold text-accent underline-offset-4 hover:underline"
        >
          {t("codeWrongAddress")}
        </button>
      </form>
    </div>
  );
}

/**
 * Round 10: accounts created without a verified email see this at the top of
 * the app until they verify: "Verify your email to start finding roles" and
 * "Send me a code", which opens the same 6-digit form in a dialog.
 */
export function VerifyEmailCodeBanner({ email, portal = "talents" }: { email: string; portal?: "talents" | "casting" }) {
  const t = useTranslations("common.emailFlow");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div
      role="region"
      aria-label={t("bannerCodeTitle")}
      className="mb-5 flex flex-wrap items-center gap-3 rounded-sedan border border-accent/40 bg-accent-soft/40 px-4 py-3 text-[14.5px]"
    >
      <MailWarning aria-hidden="true" className="size-5 shrink-0 text-accent" />
      <p className="min-w-0 flex-1 font-bold">{t("bannerCodeTitle")}</p>
      <Button size="sm" onClick={() => setOpen(true)}>
        {t("bannerSendCode")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-portal={portal} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("codeTitle")}</DialogTitle>
            <DialogDescription className="sr-only">{t("bannerCodeTitle")}</DialogDescription>
          </DialogHeader>
          {open && (
            <EmailCodeForm
              email={email}
              sendOnMount
              onVerified={() => {
                setOpen(false);
                router.refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
