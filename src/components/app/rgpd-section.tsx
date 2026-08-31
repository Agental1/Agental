"use client";

import { useTranslations } from "next-intl";
import { useActionErrorText } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";
import { useState, useTransition } from "react";
import { Download, Trash2, Loader2, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportMyData, deleteMyAccount } from "@/app/actions/account";

export function RgpdSection() {
  const t = useTranslations("talents");
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
      a.download = "agental-mes-donnees.json";
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
    <section className="space-y-3 rounded-sedan border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-medium">
        <ShieldQuestion className="size-4 text-accent" /> Données personnelles
        (RGPD)
      </h2>
      <p className="text-sm text-fg-muted">{t("space.rgpd.intro")}</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" size="sm" onClick={onExport} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Exporter mes données
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
              Oui, supprimer
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Annuler
            </Button>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-danger">{errorText(error)}</p>}
    </section>
  );
}
