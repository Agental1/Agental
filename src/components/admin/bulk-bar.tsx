"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Counts = { ticked: number; deletable: number; warnable: number };

/**
 * Round 9, group 1: the bar under Admin > Accounts. Counts the ticked rows of
 * the enclosing form (each checkbox carries data-block, empty when the row can
 * be deleted, and data-warn="1" when it can get the warning email), then asks
 * once before "Delete" or "Send warning email". The server checks the rule
 * again: a protected account is never deleted, whatever is posted.
 */
export function BulkBar({
  deleteAction,
  warnAction,
}: {
  deleteAction: (formData: FormData) => Promise<void>;
  warnAction: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations("app.admin.accounts.bulk");
  const ref = useRef<HTMLDivElement>(null);
  const deleteBtn = useRef<HTMLButtonElement>(null);
  const warnBtn = useRef<HTMLButtonElement>(null);
  const [counts, setCounts] = useState<Counts>({ ticked: 0, deletable: 0, warnable: 0 });
  const [ask, setAsk] = useState<"delete" | "warn" | null>(null);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const scan = () => {
      const boxes = [...form.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="id"]:checked')];
      setCounts({
        ticked: boxes.length,
        deletable: boxes.filter((b) => !b.dataset.block).length,
        warnable: boxes.filter((b) => !b.dataset.block && b.dataset.warn === "1").length,
      });
    };
    scan();
    form.addEventListener("change", scan);
    return () => form.removeEventListener("change", scan);
  }, []);

  const kept = counts.ticked - (ask === "warn" ? counts.warnable : counts.deletable);
  const n = ask === "warn" ? counts.warnable : counts.deletable;

  return (
    <div
      ref={ref}
      className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-sedan border border-border bg-surface/95 p-3 shadow-sm backdrop-blur"
    >
      <p className="text-sm font-bold tabular-nums" aria-live="polite">
        {t("selected", { count: counts.ticked })}
      </p>
      <div className="ml-auto flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={counts.ticked === 0} onClick={() => setAsk("warn")}>
          {t("warnCta")}
        </Button>
        <Button type="button" variant="danger" size="sm" disabled={counts.ticked === 0} onClick={() => setAsk("delete")}>
          {t("deleteCta")}
        </Button>
      </div>
      {/* The real submits: hidden, pressed after the confirmation. */}
      <button ref={deleteBtn} type="submit" formAction={deleteAction} hidden aria-hidden tabIndex={-1} />
      <button ref={warnBtn} type="submit" formAction={warnAction} hidden aria-hidden tabIndex={-1} />

      <AlertDialog open={ask !== null} onOpenChange={(o) => !o && setAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {n === 0 ? t("nothingTitle") : ask === "warn" ? t("warnTitle", { count: n }) : t("deleteTitle", { count: n })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {n === 0 ? (ask === "warn" ? t("nothingWarn") : t("nothingDelete")) : ask === "warn" ? t("warnBody") : t("deleteBody")}
            </AlertDialogDescription>
            {n > 0 && kept > 0 && (
              <p className="text-sm text-fg-muted">{ask === "warn" ? t("warnKept", { count: kept }) : t("deleteKept", { count: kept })}</p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            {n > 0 && (
              <AlertDialogAction
                variant={ask === "delete" ? "danger" : "primary"}
                onClick={() => {
                  const btn = ask === "delete" ? deleteBtn.current : warnBtn.current;
                  btn?.form?.requestSubmit(btn);
                }}
              >
                {ask === "delete" ? t("confirmDelete", { count: n }) : t("confirmWarn", { count: n })}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
