"use client";

import { useActionState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ActionErrorMessage } from "@/components/app/action-error";
import { archiveAnnouncement, createAnnouncement, type AnnouncementState } from "@/app/actions/announcements";

export function AnnouncementForm() {
  const t = useTranslations("app.admin.announcements");
  const [state, action, pending] = useActionState<AnnouncementState, FormData>(createAnnouncement, undefined);
  return (
    <form action={action} className="grid max-w-xl gap-3 rounded-sedan border border-border bg-surface p-4">
      <div className="space-y-1">
        <Label htmlFor="ann-title">{t("fieldTitle")}</Label>
        <Input id="ann-title" name="title" maxLength={120} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ann-body">{t("fieldBody")}</Label>
        <textarea id="ann-body" name="body" maxLength={600} rows={3} required className="w-full rounded-sedan border border-border bg-surface px-3 py-2 text-sm" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ann-link">{t("fieldLink")}</Label>
        <Input id="ann-link" name="link" maxLength={300} placeholder="/talents/app or https://…" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ann-audience">{t("fieldAudience")}</Label>
        <select id="ann-audience" name="audience" defaultValue="TALENT" className="h-10 w-full rounded-sedan border border-border bg-surface px-2 text-sm">
          <option value="TALENT">{t("audiences.TALENT")}</option>
          <option value="CASTING">{t("audiences.CASTING")}</option>
          <option value="ALL">{t("audiences.ALL")}</option>
        </select>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>{t("publish")}</Button>
        {state?.ok && <span className="text-sm text-success">{t("published")}</span>}
      </div>
      <ActionErrorMessage error={state?.error} />
    </form>
  );
}

export function ArchiveAnnouncement({ id }: { id: string }) {
  const t = useTranslations("app.admin.announcements");
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" size="sm" loading={pending} onClick={() => start(async () => void (await archiveAnnouncement(id)))}>
      {t("archive")}
    </Button>
  );
}
