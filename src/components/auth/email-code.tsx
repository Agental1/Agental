"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { MailWarning } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { changeMyUnverifiedEmail, confirmMyEmailCode, sendMyEmailCode } from "@/app/actions/account-email";
import { logoutAction } from "@/app/actions/auth";
import { ActionErrorMessage } from "@/components/app/action-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  initialCooldown,
  onVerified,
}: {
  email: string;
  /** Seconds before a new code may be asked, from the server (the screen after sign-up). */
  initialCooldown?: number;
  /** The banner sends the first code when the dialog opens; sign-up already sent it. */
  sendOnMount?: boolean;
  onVerified: () => void;
}) {
  const t = useTranslations("common.emailFlow");
  const [code, setCode] = useState("");
  const [error, setError] = useState<ActionError | undefined>();
  const [cooldown, setCooldown] = useState(initialCooldown ?? (sendOnMount ? 0 : RESEND_SECONDS));
  const [locked, setLocked] = useState(false);
  const [notice, setNotice] = useState<string>("");
  const [pending, start] = useTransition();
  // Sending a code never disables the boxes: a disabled field drops the focus
  // out of the banner's dialog (round 10 QA).
  const [sending, startSend] = useTransition();
  // Saving a new address has its own state: the code boxes stay usable (review, round 11).
  const [saving, startSave] = useTransition();
  const sentOnce = useRef(false);
  const boxes = useRef<HTMLInputElement>(null);
  // Round 11: "Wrong email? Change it" (unverified password accounts).
  const [address, setAddress] = useState(email);
  const [changing, setChanging] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [changeError, setChangeError] = useState<ActionError | undefined>();
  const changeField = useRef<HTMLInputElement>(null);
  const changeLink = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  function send() {
    setError(undefined);
    setNotice("");
    startSend(async () => {
      const res = await sendMyEmailCode().catch(() => ({ ok: false as const, error: err("errors.generic") }));
      if (res.ok && res.alreadyVerified) return onVerified();
      if (res.ok) {
        setNotice(t("codeSent", { email: address }));
        setCooldown(RESEND_SECONDS);
        setLocked(false);
        setError(undefined);
        window.setTimeout(() => boxes.current?.focus(), 0);
        return;
      }
      // A code went out moment ago: it still works; the button counts down the
      // server's own wait instead of showing an error.
      if ("codePending" in res && res.codePending) {
        setCooldown(res.retryInSeconds ?? RESEND_SECONDS);
        return;
      }
      setError(res.error);
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
      // Locked after 5 tries: only a new code helps.
      if (res.error.key === "errors.codeLocked" || res.error.key === "errors.codeExpired") {
        setLocked(true);
        return;
      }
      // Back in the boxes for the next try.
      window.setTimeout(() => boxes.current?.focus(), 0);
    });
  }

  function openChange() {
    setChanging(true);
    setChangeError(undefined);
    setNewAddress("");
    window.setTimeout(() => changeField.current?.focus(), 0);
  }

  function closeChange() {
    setChanging(false);
    window.setTimeout(() => changeLink.current?.focus(), 0);
  }

  function saveAddress(e: FormEvent) {
    e.preventDefault();
    setChangeError(undefined);
    startSave(async () => {
      const res = await changeMyUnverifiedEmail(newAddress).catch(() => ({ ok: false as const, error: err("errors.generic") }));
      if (!res.ok) {
        setChangeError(res.error);
        return;
      }
      setAddress(res.email);
      setChanging(false);
      setCode("");
      setLocked(false);
      setError(undefined);
      // No code went out (daily cap, no sender): "Send a new code" is ready at once.
      setCooldown(res.codeSent ? RESEND_SECONDS : 0);
      setNotice(res.codeSent ? t("codeSent", { email: res.email }) : t("emailChanged", { email: res.email }));
      window.setTimeout(() => boxes.current?.focus(), 0);
    });
  }

  return (
    <div className="space-y-4">
      <p id="email-code-label" className="text-[15px] text-fg-muted">
        {t("codeLead", { email: address })}
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
        disabled={pending || locked}
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
      <Button variant="outline" className="w-full" onClick={() => verify()} loading={pending} disabled={code.length !== 6}>
        {t("codeVerify")}
      </Button>
      <p className="text-xs text-fg-muted">{t("codeExpiry")}</p>
      {/* Round 11: email only, a blue "Send a new code" after 60 seconds, then "Wrong email? Change it". */}
      <div className="space-y-3 border-t border-border pt-4">
        <Button className="w-full" onClick={send} loading={sending} disabled={pending || sending || cooldown > 0}>
          {cooldown > 0 ? t("codeResendIn", { seconds: cooldown }) : t("codeResend")}
        </Button>
        {changing ? (
          <form onSubmit={saveAddress} className="space-y-2" noValidate>
            <label htmlFor="email-code-new-address" className="block text-sm font-bold">
              {t("changeLabel")}
            </label>
            <Input
              ref={changeField}
              id="email-code-new-address"
              type="email"
              autoComplete="email"
              inputMode="email"
              maxLength={254}
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              aria-invalid={changeError ? true : undefined}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  closeChange();
                }
              }}
            />
            <ActionErrorMessage error={changeError} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" loading={saving} disabled={sending || newAddress.trim().length < 3}>
                {t("changeSave")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={closeChange}>
                {t("changeCancel")}
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-center text-[14.5px]">
            {t("changePrompt")}{" "}
            <button
              ref={changeLink}
              type="button"
              onClick={openChange}
              disabled={sending}
              className="inline-flex min-h-11 items-center font-bold text-accent underline-offset-4 hover:underline"
            >
              {t("changeLink")}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

/** The screen right after a password sign-up (/verifier without a token). */
export function EmailCodeScreen({
  email,
  next,
  liveCode,
  cooldown,
}: {
  email: string;
  next: string;
  liveCode: boolean;
  cooldown: number;
}) {
  const t = useTranslations("common.emailFlow");
  const router = useRouter();
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl">{t("codeTitle")}</h1>
      </div>
      {/* Coming back later with no live code: a new one goes out at once. */}
      <EmailCodeForm
        email={email}
        sendOnMount={!liveCode}
        initialCooldown={liveCode ? cooldown : undefined}
        onVerified={() => router.replace(next)}
      />
      <form action={logoutAction} className="text-center">
        <button
          type="submit"
          className="inline-flex min-h-11 items-center text-[14px] text-fg-muted underline-offset-4 hover:underline"
        >
          {t("signOut")}
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
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div
      role="region"
      aria-label={t("bannerCodeTitle")}
      className="mb-5 flex flex-wrap items-center gap-3 rounded-sedan border border-accent/40 bg-accent-soft/40 px-4 py-3 text-[14.5px]"
    >
      <MailWarning aria-hidden="true" className="size-5 shrink-0 text-accent" />
      <p className="min-w-0 flex-1 font-bold">{t("bannerCodeTitle")}</p>
      <Button ref={trigger} size="sm" onClick={() => setOpen(true)}>
        {t("bannerSendCode")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-portal={portal}
          className="sm:max-w-md"
          onEscapeKeyDown={(e) => {
            // Escape in "Change it" closes that form, not the dialog.
            if ((e.target as HTMLElement | null)?.id === "email-code-new-address") e.preventDefault();
          }}
          onCloseAutoFocus={(e) => {
            // Back on "Send me a code" (the button is not a Radix trigger).
            e.preventDefault();
            trigger.current?.focus();
          }}
        >
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
