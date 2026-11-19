"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The account card at the top of each audience page: one card, two modes.
 *
 * "Create account" and "Sign in" are tabs; each mode's heading and form are
 * rendered on the server and handed in as slots, so the provider buttons (a
 * server component) and the server actions stay where they belong. The card
 * sits in the page flow: it never blocks reading and never comes back as a
 * pop-up.
 */
export function AccountCard({
  id = "account",
  signupTitle,
  signupLead,
  signinTitle,
  signinLead,
  signup,
  signin,
  className,
}: {
  id?: string;
  signupTitle: string;
  signupLead: string;
  signinTitle: string;
  signinLead: string;
  signup: React.ReactNode;
  signin: React.ReactNode;
  className?: string;
}) {
  const t = useTranslations("common.account");
  const [mode, setMode] = useState<"signup" | "signin">("signup");

  return (
    <div
      id={id}
      className={cn(
        "w-full max-w-[540px] scroll-mt-24 rounded-sedan-2xl border border-border bg-surface p-[clamp(20px,3vw,36px)] shadow-[0_30px_60px_-36px_rgb(11_15_26/0.45)]",
        className
      )}
    >
      <div
        role="tablist"
        aria-label={t("tabs")}
        className="grid grid-cols-2 gap-1 rounded-full border border-border bg-surface-2 p-1"
      >
        {(["signup", "signin"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            id={`${id}-tab-${m}`}
            aria-selected={mode === m}
            aria-controls={`${id}-panel`}
            onClick={() => setMode(m)}
            className={cn(
              "pressable inline-flex h-11 items-center justify-center rounded-full px-4 text-[15px] font-bold [--hover-scale:1.02] [--press-scale:1.04]",
              mode === m ? "cta-fill" : "text-fg-muted hover:text-fg"
            )}
          >
            {t(m === "signup" ? "create" : "signIn")}
          </button>
        ))}
      </div>

      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${mode}`} className="mt-6">
        <h2 className="text-[clamp(1.5rem,1.2vw+1.1rem,2rem)] leading-tight">
          {mode === "signup" ? signupTitle : signinTitle}
        </h2>
        <p className="mt-1.5 text-fg-muted">{mode === "signup" ? signupLead : signinLead}</p>
        <div className="mt-5 space-y-4">{mode === "signup" ? signup : signin}</div>
      </div>
    </div>
  );
}
