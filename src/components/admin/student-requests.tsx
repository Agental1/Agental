"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { decideStudentPrice } from "@/app/actions/sites";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface StudentRequestRow {
  id: string;
  email: string;
  name: string | null;
  status: string;
  createdAt: string;
  decidedAt: string | null;
}

/** Limelight student price requests: approve or decline, newest decisions below. */
export function StudentRequests({ rows, locale }: { rows: StudentRequestRow[]; locale: string }) {
  const t = useTranslations("app.admin.studentRequests");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [, start] = useTransition();
  const date = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });

  function decide(id: string, decision: "approve" | "reject") {
    setBusy(id);
    setFailed(false);
    start(async () => {
      const res = await decideStudentPrice(id, decision).catch(() => ({ ok: false }));
      setBusy(null);
      if (!res.ok) setFailed(true);
      router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl font-medium">{t("title")}</h2>
      <p className="text-sm text-fg-muted">{t("note")}</p>
      {failed && <p className="text-sm text-danger">{t("failed")}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-sedan border border-border bg-surface p-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-bold">{r.name || r.email}</span> <span className="text-fg-muted">{r.email}</span>
                <span className="block text-xs text-fg-subtle">
                  {t("requested", { date: date(r.createdAt) })}
                  {r.decidedAt ? ` · ${t("decided", { date: date(r.decidedAt) })}` : ""}
                </span>
              </span>
              <Badge variant="neutral">{t(`status.${r.status as "PENDING" | "APPROVED" | "REJECTED" | "USED"}`)}</Badge>
              {r.status === "PENDING" && (
                <span className="flex gap-2">
                  <Button size="sm" disabled={busy === r.id} onClick={() => decide(r.id, "approve")}>
                    {t("approve")}
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => decide(r.id, "reject")}>
                    {t("decline")}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
