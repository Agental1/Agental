"use client";

import { useActionErrorText } from "@/components/app/action-error";
import type { Locale } from "next-intl";
import { useActionState, useState } from "react";
import { Captcha } from "@/components/auth/captcha";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, Circle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { AuthState } from "@/app/actions/auth";
import { passwordChecks, type PasswordRuleId } from "@/domain/auth";
import { ConsentChoice } from "@/components/consent/consent-choice";
import { cn } from "@/lib/utils";

type Action = (state: AuthState, formData: FormData) => Promise<AuthState>;

const RULES: PasswordRuleId[] = ["length", "uppercase", "special"];

/**
 * Email and password, for sign-up (when `kind` is given) and sign-in.
 *
 * Sign-up shows the password rules as a live checklist under the field and
 * keeps the button disabled until all three pass. The rules themselves live
 * in `src/domain/auth.ts`, the same list the server enforces. Sign-in never
 * applies them, so older passwords keep working.
 *
 * Sign-up has a second step, the cookie choice: "Create my account" first
 * shows every cookie category with Accept all, Reject non-essential and
 * Manage preferences; any of the three answers creates the account. The
 * choice is written to a first-party cookie that sign-up copies onto the new
 * user.
 *
 * Both fields are controlled: React resets an uncontrolled form after a
 * server action, which used to wipe the email when the server refused the
 * password.
 */
export function AuthForm({
  action,
  submitLabel,
  kind,
  locale,
  showName = false,
  size = "md",
  next,
  termsEnabled = false,
}: {
  action: Action;
  submitLabel: string;
  kind?: "TALENT" | "CASTING";
  locale: Locale;
  showName?: boolean;
  /** "lg" for the account card on the audience pages: 52px fields. */
  size?: "md" | "lg";
  /** A page to come back to after sign-in, checked again on the server. */
  next?: string;
  /** Round 11: the box also accepts the Terms of Service once they are published (TERMS_PAGE_ENABLED). */
  termsEnabled?: boolean;
}) {
  const t = useTranslations("app");
  const errorText = useActionErrorText();
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    undefined
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Round 11: "I agree to the Privacy Policy" (required to create an account).
  const [agreed, setAgreed] = useState(false);
  const [step, setStep] = useState<"credentials" | "consent">("credentials");
  const tc = useTranslations("common.consent");
  const tf = useTranslations("common.emailFlow");

  const signup = Boolean(kind);
  const checks = passwordChecks(password);
  const rulesPass = RULES.every((rule) => checks[rule]);
  const field = size === "lg" ? "h-[52px] rounded-sedan px-4 text-base sm:h-[52px] sm:text-base" : "";

  // A refused submit (email taken, weak password) comes back to the fields.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.error) {
      setStep("credentials");
      // React resets the form after a refused submit: the box shows unticked, so the state follows.
      setAgreed(false);
    }
  }

  return (
    <form
      action={formAction}
      className="space-y-4"
      onSubmit={(e) => {
        // First press on sign-up: show the cookie choice instead of submitting.
        if (signup && step === "credentials") {
          e.preventDefault();
          setStep("consent");
        }
      }}
    >
      {kind && <input type="hidden" name="kind" value={kind} />}
      <input type="hidden" name="locale" value={locale} />
      {next && <input type="hidden" name="next" value={next} />}

      <div className={cn("space-y-4", step === "consent" && "hidden")}>
      {showName && (
        <div className="space-y-1.5">
          <Label htmlFor="name">{t("auth.name")}</Label>
          <Input id="name" name="name" autoComplete="name" className={field} />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">{t("auth.email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={t("auth.emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">{t("auth.password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete={signup ? "new-password" : "current-password"}
          minLength={signup ? 8 : undefined}
          aria-describedby={signup ? "password-rules" : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={field}
        />
        {signup && (
          <div id="password-rules" className="pt-1">
            <p className="text-[13px] text-fg-muted">{t("auth.rules.title")}</p>
            <ul className="mt-1.5 grid gap-1 sm:grid-cols-3 sm:gap-2">
              {RULES.map((rule) => {
                const ok = checks[rule];
                return (
                  <li
                    key={rule}
                    className={cn(
                      "flex items-center gap-1.5 text-[13px] leading-tight",
                      ok ? "text-success" : "text-fg-muted"
                    )}
                  >
                    {ok ? (
                      <Check aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={3} />
                    ) : (
                      <Circle aria-hidden="true" className="size-3.5 shrink-0" />
                    )}
                    {t(`auth.rules.${rule}`)}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {signup && (
        <div className="flex items-start gap-2.5">
          <input
            id="privacy"
            name="privacy"
            type="checkbox"
            value="yes"
            required
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]"
          />
          <label htmlFor="privacy" className="text-[14px] leading-snug">
            {t.rich(termsEnabled ? "auth.agreePrivacyTerms" : "auth.agreePrivacy", {
              privacy: (chunks) => (
                <Link href="/talents/confidentialite" target="_blank" className="font-bold text-accent underline underline-offset-4">
                  {chunks}
                </Link>
              ),
              terms: (chunks) => (
                <Link href="/talents/conditions" target="_blank" className="font-bold text-accent underline underline-offset-4">
                  {chunks}
                </Link>
              ),
            })}
          </label>
        </div>
      )}

      </div>

      {signup && step === "consent" && (
        <div className="enter space-y-3">
          <div>
            <h3 className="text-[1.125rem]">{tc("title")}</h3>
            <p className="mt-1 text-[14px] leading-snug text-fg-muted">{tc("lead")}</p>
          </div>
          <ConsentChoice submit />
          <button
            type="button"
            onClick={() => setStep("credentials")}
            className="inline-flex min-h-11 items-center text-[14px] font-bold text-accent underline-offset-4 hover:underline"
          >
            {tc("back")}
          </button>
        </div>
      )}

      {!signup && (
        <p className="-mt-1">
          <Link
            href="/mot-de-passe-oublie"
            className="inline-flex min-h-11 items-center text-[14px] font-bold text-accent underline-offset-4 hover:underline"
          >
            {tf("forgot")}
          </Link>
        </p>
      )}

      {state?.error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-sedan bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          <AlertCircle className="size-4 shrink-0" />
          {errorText(state.error)}
        </p>
      )}

      {signup && <Captcha />}

      {step === "credentials" && (
        <Button
          type="submit"
          size={size === "lg" ? "lg" : "md"}
          className={cn("w-full", size === "lg" && "h-[52px] text-[16px]")}
          disabled={pending || (signup && (!rulesPass || !agreed))}
        >
          {submitLabel}
        </Button>
      )}
    </form>
  );
}
