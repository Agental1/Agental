"use client";

import { useTranslations } from "next-intl";
import { useActionErrorText } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";
import { useState, useTransition } from "react";
import { Download, Trash2, Loader2, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportMyData, deleteMyAccount } from "@/app/actions/account";

export function RgpdSection({ embedded = false }: { embedded?: boolean }) {
  const t = useTranslations("talents");
  // Shared by the Talent and Casting settings pages, so the labels added here
  // live in the neutral namespace.
  const ta = useTranslations("app");
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<ActionError | undefined>();
  const errorText = useActionErrorText();

  function onExport() {
    setError(undefined);
    start(async () => {
      const res = await exportMyData();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const blob = new Blob([JSON.stringify(res.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "agental-data.json";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function onDelete() {
    setError(undefined);
    start(async () => {
      try {
        await deleteMyAccount();
      } catch (e) {
        if (
          e &&
          typeof e === "object" &&
          "digest" in e &&
          String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")
        ) {
          throw e;
        }
        setError(err("errors.deleteFailed"));
      }
    });
  }

  return (
    <section className={embedded ? "space-y-3 border-t border-border pt-4" : "space-y-3 rounded-sedan border border-border bg-surface p-5"}>
      {embedded ? (
        <h3 className="text-sm font-medium">{ta("rgpd.title")}</h3>
      ) : (
        <h2 className="flex items-center gap-2 font-display text-lg font-medium">
          <ShieldQuestion className="size-4 text-accent" /> {ta("rgpd.title")}
        </h2>
      )}
      <p className="text-sm text-fg-muted">{t("space.rgpd.intro")}</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" size="sm" onClick={onExport} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {ta("rgpd.export")}
        </Button>
        {!confirming ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger hover:bg-danger/10"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="size-4" />{t("space.rgpd.delete")}</Button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-danger">{t("space.rgpd.confirm")}</span>
            <Button variant="danger" size="sm" onClick={onDelete} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {ta("rgpd.confirmDelete")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              {ta("actions.cancel")}
            </Button>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-danger">{errorText(error)}</p>}
    </section>
  );
}
