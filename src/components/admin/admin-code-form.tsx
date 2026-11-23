"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionErrorMessage } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";
import { submitAdminCode } from "@/app/actions/admin-mfa";

/** Round 8d: the 6-digit code of the admin's authenticator app. */
export function AdminCodeForm({ labels }: { labels: { code: string; submit: string; submitting: string } }) {
  const id = useId();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<ActionError | undefined>();
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    start(async () => {
      const res = await submitAdminCode(code).catch(() => ({ ok: false as const, error: err("errors.generic") }));
      if (!res.ok) {
        setError(res.error);
        setCode("");
        return;
      }
      router.replace("/admin");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor={id} className="text-sm font-medium">
        {labels.code}
      </label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="font-mono text-lg tracking-widest"
        autoFocus
      />
      <ActionErrorMessage error={error} />
      <Button type="submit" disabled={code.replace(/\s/g, "").length !== 6} loading={pending} className="w-full">
        {pending ? labels.submitting : labels.submit}
      </Button>
    </form>
  );
}
