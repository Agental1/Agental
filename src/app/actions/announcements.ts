"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { currentAdminId } from "@/lib/limelight/admin";
import { err, zodError, type ActionError } from "@/domain/action-result";

/**
 * Admin > Announcements (round 8): product updates for the bell. Admins only
 * (contact@agental.co, src/domain/admin.ts). Shown in the app only; nothing is
 * emailed or pushed.
 */
const AnnouncementInput = z.object({
  title: z.string().trim().min(1, "errors.invalidInput").max(120),
  body: z.string().trim().min(1, "errors.invalidInput").max(600),
  link: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || v.startsWith("/") || /^https:\/\//.test(v), "errors.invalidInput")
    .optional()
    .default(""),
  audience: z.enum(["TALENT", "CASTING", "ALL"]),
});

export type AnnouncementState = { ok?: boolean; error?: ActionError } | undefined;

export async function createAnnouncement(_prev: AnnouncementState, form: FormData): Promise<AnnouncementState> {
  const adminId = await currentAdminId();
  if (!adminId) return { error: err("errors.forbidden") };
  const parsed = AnnouncementInput.safeParse({
    title: form.get("title"),
    body: form.get("body"),
    link: form.get("link") ?? "",
    audience: form.get("audience"),
  });
  if (!parsed.success) return { error: zodError(parsed.error) };
  const a = await prisma.announcement.create({
    data: { ...parsed.data, link: parsed.data.link || null, createdById: adminId },
  });
  await audit({ actorUserId: adminId, action: "admin.announcement.create", resourceType: "Announcement", resourceId: a.id, after: { audience: a.audience } });
  revalidatePath("/[locale]/admin/annonces", "page");
  return { ok: true };
}

/** Archive: the announcement leaves every bell. Nothing is deleted. */
export async function archiveAnnouncement(id: string): Promise<{ ok: boolean; error?: ActionError }> {
  const adminId = await currentAdminId();
  if (!adminId) return { ok: false, error: err("errors.forbidden") };
  await prisma.announcement.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: new Date() } });
  await audit({ actorUserId: adminId, action: "admin.announcement.archive", resourceType: "Announcement", resourceId: id });
  revalidatePath("/[locale]/admin/annonces", "page");
  return { ok: true };
}
