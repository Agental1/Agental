import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { COMPLETENESS_SELECT, completenessOf } from "@/lib/completeness";
import { defaultCategory, mediaCategory } from "@/domain/media-categories";

/** Most rows a view shows or exports; the page says when it is reached. */
export const VIEW_CAP = 2000;

/**
 * The admin site's data views: profiles, media and the audit log, with search
 * and filters shared by each page and its CSV export. Server only; every
 * caller checks currentAdminId(). Read-only.
 */
type Get = (k: string) => string | null | undefined;
const q = (get: Get) => (get("q") ?? "").trim().slice(0, 100) || undefined;

/* ── Profiles ─────────────────────────────────────────────────────────── */

export interface ProfileFilters {
  q?: string;
  complete?: "yes" | "no";
}
export function profileFiltersFrom(get: Get): ProfileFilters {
  const c = get("complete");
  return { q: q(get), complete: c === "yes" || c === "no" ? c : undefined };
}

export async function listProfiles(f: ProfileFilters, take = VIEW_CAP) {
  const rows = await prisma.artistProfile.findMany({
    where: f.q
      ? { OR: [{ stageName: { contains: f.q, mode: "insensitive" } }, { city: { contains: f.q, mode: "insensitive" } }, { user: { email: { contains: f.q, mode: "insensitive" } } }] }
      : {},
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      createdAt: true,
      isMinor: true,
      user: { select: { id: true, email: true, accountStatus: true } },
      ...COMPLETENESS_SELECT,
    },
  });
  const out = rows.map((p) => {
    const counts = { SELF: 0, PRODUCTIONS: 0, VIDEOS: 0, OTHER: 0 } as Record<string, number>;
    for (const m of p.media) if (m.type !== "SELFTAPE") counts[mediaCategory(m)] += 1;
    return {
      id: p.id,
      userId: p.user.id,
      email: p.user.email,
      status: p.user.accountStatus,
      stageName: p.stageName,
      city: p.city ?? "",
      specialties: p.specialties.map((s) => s.kind).join(" "),
      completeness: completenessOf(p),
      media: counts,
      selftapes: p.media.filter((m) => m.type === "SELFTAPE").length,
      isMinor: p.isMinor,
      createdAt: p.createdAt,
    };
  });
  return out.filter((r) => !f.complete || (r.completeness === 100) === (f.complete === "yes"));
}
export type ProfileRow = Awaited<ReturnType<typeof listProfiles>>[number];

/* ── Media ────────────────────────────────────────────────────────────── */

export interface MediaFilters {
  q?: string;
  type?: string;
  category?: string;
}
const TYPES = ["PHOTO", "VIDEO", "AUDIO", "SELFTAPE"];
const CATS = ["SELF", "PRODUCTIONS", "VIDEOS", "OTHER"];
export function mediaFiltersFrom(get: Get): MediaFilters {
  const t = get("type");
  const c = get("category");
  return { q: q(get), type: t && TYPES.includes(t) ? t : undefined, category: c && CATS.includes(c) ? c : undefined };
}

export async function listMedia(f: MediaFilters, take = VIEW_CAP) {
  // The category in the query itself (rows from before categories fall back on their type).
  const fallbackTypes = ["PHOTO", "VIDEO", "AUDIO", "SELFTAPE"].filter((t) => defaultCategory(t) === f.category);
  const where: Prisma.MediaWhereInput = {
    ...(f.type ? { type: f.type } : {}),
    ...(f.category ? { AND: [{ OR: [{ category: f.category }, { category: null, type: { in: fallbackTypes } }] }] } : {}),
    ...(f.q
      ? { OR: [{ description: { contains: f.q, mode: "insensitive" } }, { title: { contains: f.q, mode: "insensitive" } }, { profile: { stageName: { contains: f.q, mode: "insensitive" } } }, { profile: { user: { email: { contains: f.q, mode: "insensitive" } } } }] }
      : {}),
  };
  const rows = await prisma.media.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      type: true,
      category: true,
      description: true,
      title: true,
      mime: true,
      sizeBytes: true,
      destination: true,
      status: true,
      createdAt: true,
      profile: { select: { stageName: true, user: { select: { id: true, email: true } } } },
    },
  });
  return rows.map((m) => ({ ...m, category: mediaCategory(m) }));
}
export type MediaRow = Awaited<ReturnType<typeof listMedia>>[number];

/* ── Audit log ────────────────────────────────────────────────────────── */

export interface AuditFilters {
  q?: string;
  action?: string;
}
export function auditFiltersFrom(get: Get): AuditFilters {
  const a = (get("action") ?? "").trim();
  return { q: q(get), action: /^[a-z0-9._-]{1,80}$/i.test(a) ? a : undefined };
}

export function listAudit(f: AuditFilters, take = 500) {
  return prisma.auditLog.findMany({
    where: {
      // Admin page views fill the log; they show only when asked for (action "admin.view").
      ...(f.action ? { action: { startsWith: f.action } } : { NOT: { action: { startsWith: "admin.view." } } }),
      ...(f.q
        ? { OR: [{ resourceId: { contains: f.q } }, { resourceType: { contains: f.q, mode: "insensitive" } }, { actor: { email: { contains: f.q, mode: "insensitive" } } }] }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, createdAt: true, action: true, resourceType: true, resourceId: true, actor: { select: { email: true } } },
  });
}
export type AuditRow = Awaited<ReturnType<typeof listAudit>>[number];

/** The email log keeps 180 days (owner may change). Run when staff open Emails. */
export const EMAIL_LOG_DAYS = 180;
export async function purgeOldEmailLogs(now = new Date()) {
  await prisma.emailLog.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - EMAIL_LOG_DAYS * 24 * 60 * 60 * 1000) } } });
}
