"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Circle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  requestEmailVerification,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from "@/app/actions/account-email";
import { logoutAction } from "@/app/actions/auth";
import { ActionErrorMessage } from "@/components/app/action-error";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { err, type ActionError } from "@/domain/action-result";
import { passwordChecks, type PasswordRuleId } from "@/domain/auth";
import { cn } from "@/lib/utils";

const RULES: PasswordRuleId[] = ["length", "uppercase", "special"];
const FIELD = "h-[52px] px-4 text-base sm:h-[52px] sm:text-base";

function Heading({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="space-y-1.5 text-center">
      <h1 className="text-2xl">{title}</h1>
      <p className="text-[15px] text-fg-muted">{lead}</p>
    </div>
  );
}

function BackToSignIn() {
  const t = useTranslations("common.emailFlow");
  return (
    <p className="text-center">
      <Link
        href="/connexion"
        className="inline-flex min-h-11 items-center text-[14.5px] font-bold text-accent underline-offset-4 hover:underline"
      >
        {t("backToSignIn")}
      </Link>
    </p>
  );
}

/**
 * "Forgot password?": ask for a reset link. The answer is the same whether or
 * not an account uses the address, so the form never reveals who has one.
 */
export function ForgotPasswordForm() {
  const t = useTranslations("common.emailFlow");
  const ta = useTranslations("app");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ActionError | undefined>();
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
      <Heading title={t("forgotTitle")} lead={t("forgotLead")} />
      {sent ? (
        <p role="status" className="rounded-sedan border border-border bg-surface p-4 text-[15px]">
          {t("sent")}
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(undefined);
            start(async () => {
              const res = await requestPasswordReset(email);
              if (res.ok) setSent(true);
              else setError(res.error);
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="reset-email">{ta("auth.email")}</Label>
            <Input
              id="reset-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD}
            />
          </div>
          <ActionErrorMessage error={error} />
          <Button type="submit" size="lg" className="h-[52px] w-full" disabled={pending}>
            {t("sendLink")}
          </Button>
        </form>
      )}
      <BackToSignIn />
    </div>
  );
}

/**
 * The page a reset email links to. The new password follows the same three
 * rules as sign-up, shown as a live checklist. The token is used only when the
 * button is pressed: mail scanners open links, and a token works once.
 */
export function ResetPasswordForm({ token }: { token: string | null }) {
  const t = useTranslations("common.emailFlow");
  const ta = useTranslations("app");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<ActionError | undefined>();
  const [pending, start] = useTransition();
  const checks = passwordChecks(password);
  const rulesPass = RULES.every((rule) => checks[rule]);

  if (!token) {
    return (
      <div className="space-y-6">
        <Heading title={t("resetTitle")} lead={t("missingToken")} />
        <BackToSignIn />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Heading title={t("resetTitle")} lead={done ? t("resetDone") : t("resetLead")} />
      {!done && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(undefined);
            start(async () => {
              const res = await resetPassword(token, password);
              if (res.ok) setDone(true);
              else setError(res.error);
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="new-password">{t("newPassword")}</Label>
            <Input
              id="new-password"
              type="password"
              required
              autoComplete="new-password"
              aria-describedby="new-password-rules"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={FIELD}
            />
            <div id="new-password-rules" className="pt-1">
              <p className="text-[13px] text-fg-muted">{ta("auth.rules.title")}</p>
              <ul className="mt-1.5 grid gap-1">
                {RULES.map((rule) => (
                  <li
                    key={rule}
                    className={cn(
                      "flex items-center gap-1.5 text-[13px]",
                      checks[rule] ? "text-success" : "text-fg-muted"
                    )}
                  >
                    {checks[rule] ? (
                      <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                    ) : (
                      <Circle aria-hidden="true" className="size-3.5" />
                    )}
                    {ta(`auth.rules.${rule}`)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <ActionErrorMessage error={error} />
          <Button type="submit" size="lg" className="h-[52px] w-full" disabled={pending || !rulesPass}>
            {t("savePassword")}
          </Button>
        </form>
      )}
      <BackToSignIn />
    </div>
  );
}

/** The page a confirmation email links to: one press confirms the address. */
export function VerifyEmailButton({ token }: { token: string }) {
  const t = useTranslations("common.emailFlow");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<ActionError | undefined>();
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
      <Heading title={t("verifyTitle")} lead={done ? t("verified") : t("verifyLead")} />
      <ActionErrorMessage error={error} />
      {done ? (
        <Button asChild size="lg" className="h-[52px] w-full">
          <Link href="/continuer">{t("continue")}</Link>
        </Button>
      ) : (
        <Button
          size="lg"
          className="h-[52px] w-full"
          disabled={pending}
          onClick={() => {
            setError(undefined);
            start(async () => {
              const res = await verifyEmail(token);
              if (res.ok) setDone(true);
              else setError(res.error);
            });
          }}
        >
          {t("confirm")}
        </Button>
      )}
    </div>
  );
}

/**
 * "Check your inbox": where a signed-in account with an unconfirmed address
 * waits. The resend button rests for 60 seconds after each use; the server
 * enforces the same limit.
 */
export function CheckInbox({ email }: { email: string }) {
  const t = useTranslations("common.emailFlow");
  const [cooldown, setCooldown] = useState(0);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<ActionError | undefined>();
  const [pending, start] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  return (
    <div className="space-y-6">
      <Heading title={t("inboxTitle")} lead={t("inboxLead", { email })} />
      <ActionErrorMessage error={error} />
      <p role="status" className="min-h-5 text-center text-[14px] font-bold text-success">
        {resent ? t("resent") : ""}
      </p>
      <Button
        size="lg"
        variant="secondary"
        className="h-[52px] w-full border-border-strong"
        disabled={pending || cooldown > 0}
        onClick={() => {
          setError(undefined);
          setResent(false);
          start(async () => {
            const res = await requestEmailVerification();
            if (!res.ok) {
              setError(res.error ?? err("errors.generic"));
              return;
            }
            setResent(true);
            setCooldown(60);
          });
        }}
      >
        {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
      </Button>
      <form action={logoutAction} className="text-center">
        <button
          type="submit"
          className="inline-flex min-h-11 items-center text-[14.5px] font-bold text-accent underline-offset-4 hover:underline"
        >
          {t("signOut")}
        </button>
      </form>
    </div>
  );
}
