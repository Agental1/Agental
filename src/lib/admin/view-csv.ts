import { toCsv } from "@/lib/admin/csv";
import type { AuditRow, MediaRow, ProfileRow } from "@/lib/admin/views";

export function profilesCsv(rows: ProfileRow[]): string {
  return toCsv(
    ["profile", "user", "email", "status", "stage_name", "city", "specialties", "completeness", "photos_self", "productions", "videos", "other", "selftapes", "minor", "created"],
    rows.map((r) => [r.id, r.userId, r.email, r.status, r.stageName, r.city, r.specialties, r.completeness, r.media.SELF, r.media.PRODUCTIONS, r.media.VIDEOS, r.media.OTHER, r.selftapes, r.isMinor, r.createdAt])
  );
}

/** Ids and facts only: never a storage key or a signed link. */
export function mediaCsv(rows: MediaRow[]): string {
  return toCsv(
    ["media", "type", "category", "description", "mime", "bytes", "destination", "status", "owner", "email", "created"],
    rows.map((m) => [m.id, m.type, m.category, m.description ?? m.title ?? "", m.mime ?? "", m.sizeBytes ?? "", m.destination, m.status, m.profile.stageName, m.profile.user.email, m.createdAt])
  );
}

export function auditCsv(rows: AuditRow[]): string {
  return toCsv(
    ["when", "action", "resource_type", "resource_id", "actor"],
    rows.map((a) => [a.createdAt, a.action, a.resourceType, a.resourceId, a.actor?.email ?? ""])
  );
}
