"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useActionErrorText } from "@/components/app/action-error";
import { saveRoleAlert } from "@/app/actions/profile";
import { cn } from "@/lib/utils";
import { StepNumber } from "./step-number";

export type RoleAlertChannel = "email" | "sms" | "both";

/**
 * "When we find a role for you, tell me by" (round 8), in Preferences and in
 * Settings > Notifications. Email by default. Text and Both need a valid phone
 * and the consent box, unticked by default. Nothing is sent in round 8.
 */
export function RoleAlertForm({
  initial,
  hasPhone,
  consentGiven,
  number,
}: {
  initial: RoleAlertChannel;
  hasPhone: boolean;
  consentGiven: boolean;
  /** Its number in Preferences (round 8c); none in Settings. */
  number?: number;
}) {
  const t = useTranslations("talents.space.roleAlert");
  const te = useTranslations("talents.space.profileEditor");
  const errorText = useActionErrorText();
  const name = useId();
  const [channel, setChannel] = useState<RoleAlertChannel>(initial);
  const [consent, setConsent] = useState(false);
  const [pending, start] = useTransition();
  const wantsSms = channel !== "email";
  const needsConsent = wantsSms && !consentGiven;
  const blocked = (wantsSms && !hasPhone) || (needsConsent && !consent);

  return (
    <fieldset className="space-y-3" data-field="roleAlert">
      <legend className="text-sm font-medium">
        <StepNumber n={number} />
        {t("legend")}
        {number != null && <span className="font-normal text-fg-muted"> {te("optional")}</span>}
      </legend>
      <div className="flex flex-wrap gap-2">
        {(["email", "sms", "both"] as const).map((c) => (
          <label
            key={c}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1.5 text-sm",
              channel === c ? "border-accent bg-accent-soft text-accent" : "border-border hover:border-accent"
            )}
          >
            <input type="radio" name={name} className="sr-only" checked={channel === c} onChange={() => setChannel(c)} />
            {t(`channels.${c}`)}
          </label>
        ))}
      </div>
      {wantsSms && !hasPhone && <p className="text-sm text-danger">{t("needsPhone")}</p>}
      {needsConsent && (
        <label className="flex max-w-xl items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{t("consent")}</span>
        </label>
      )}
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        disabled={blocked}
        onClick={() =>
          start(async () => {
            const res = await saveRoleAlert({ channel, smsConsent: consent || consentGiven });
            if (res.ok) toast.success(t("saved"));
            else toast.error(errorText(res.error) ?? "");
          })
        }
      >
        {t("save")}
      </Button>
      <p className="text-xs text-fg-muted">{t("note")}</p>
    </fieldset>
  );
}
