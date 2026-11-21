"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Film, Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { deleteRecording } from "@/app/actions/uploads";
import { ActionErrorMessage } from "@/components/app/action-error";
import { Badge } from "@/components/ui/badge";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { err, type ActionError } from "@/domain/action-result";

export interface LibraryItem {
  id: string;
  url: string;
  destination: "library" | "profile";
  takeNumber: number | null;
  title: string | null;
  qualityScore: number | null;
  createdAt: string;
}

/**
 * Every saved video and self-tape, from the media list (both destinations):
 * play through the private media route (short-lived signed link), and delete.
 */
export function RecordingsLibrary({ items }: { items: LibraryItem[] }) {
  const t = useTranslations("talents.space");
  const ta = useTranslations("app");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ActionError | undefined>();
  const [, start] = useTransition();

  function remove(id: string) {
    setBusy(id);
    setError(undefined);
    start(async () => {
      const res = await deleteRecording(id).catch(() => ({ ok: false as const, error: err("errors.generic") }));
      setBusy(null);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  if (items.length === 0) return <p className="text-sm text-fg-muted">{t("library.empty")}</p>;

  return (
    <div className="space-y-3">
      <ActionErrorMessage error={error} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-sedan border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <Film aria-hidden="true" className="size-4 shrink-0 text-accent" />
                <span className="truncate">
                  {item.title || (item.takeNumber ? t("selftape.take", { n: item.takeNumber }) : t("library.video"))}
                </span>
              </span>
              <Badge variant="neutral">
                {item.destination === "profile" ? t("studio.toProfile") : t("studio.toLibrary")}
              </Badge>
            </div>
            <video
              src={item.url}
              controls
              preload="metadata"
              playsInline
              className="mt-3 aspect-video w-full rounded-sedan bg-black object-cover"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-fg-muted">
                {new Date(item.createdAt).toLocaleDateString()}
                {item.qualityScore !== null ? ` · ${item.qualityScore}/100` : ""}
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" loading={busy === item.id}>
                    {busy !== item.id && <Trash2 className="size-4" />}
                    {t("library.delete")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent data-portal="talents">
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("library.confirmDelete")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {item.title || (item.takeNumber ? t("selftape.take", { n: item.takeNumber }) : t("library.video"))}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{ta("actions.cancel")}</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => remove(item.id)}>
                      {t("library.delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
