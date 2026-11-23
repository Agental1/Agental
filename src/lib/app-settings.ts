import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { EMAIL_CATEGORIES, type EmailCategory } from "@/lib/email-unsubscribe";
import { isSearchAccess, type SearchAccess } from "@/domain/workflow/eligibility";

/**
 * Round 9: the switches staff change in Admin > Controls. Stored in
 * AppSetting, read fresh on every run (no cache), every change audited.
 *
 *   emails.approved   the automatic email categories staff approved (founder
 *                     rule: no category goes out without a staff approval);
 *                     none by default.
 *   pause             (group 9) everything automatic stopped at once.
 */
const APPROVED_KEY = "emails.approved";

export async function approvedEmailCategories(): Promise<Set<EmailCategory>> {
  const row = await prisma.appSetting.findUnique({ where: { key: APPROVED_KEY } });
  try {
    const list = JSON.parse(row?.value ?? "[]") as unknown;
    return new Set(Array.isArray(list) ? EMAIL_CATEGORIES.filter((c) => list.includes(c)) : []);
  } catch {
    return new Set();
  }
}

export async function setEmailCategoryApproved(adminId: string, category: EmailCategory, approved: boolean): Promise<void> {
  const current = await approvedEmailCategories();
  const before = [...current];
  if (approved) current.add(category);
  else current.delete(category);
  const value = JSON.stringify([...current].sort());
  // Turning a category on never sends its backlog: what is already waiting counts as handled.
  if (approved && !before.includes(category)) {
    const now = new Date();
    if (category === "application_update") await prisma.notification.updateMany({ where: { kind: "STATUS", emailedAt: null }, data: { emailedAt: now } });
    if (category === "roles_found") await prisma.notification.updateMany({ where: { kind: "ROLE_FOUND", emailedAt: null }, data: { emailedAt: now } });
    if (category === "message_reply") await prisma.message.updateMany({ where: { emailedAt: null, OR: [{ fromTeam: true }, { fromAgent: true }] }, data: { emailedAt: now } });
  }
  await prisma.appSetting.upsert({
    where: { key: APPROVED_KEY },
    create: { key: APPROVED_KEY, value, updatedById: adminId },
    update: { value, updatedById: adminId },
  });
  await audit({ actorUserId: adminId, action: "admin.emails.approval", resourceType: "AppSetting", resourceId: APPROVED_KEY, before: { approved: before }, after: { approved: [...current] } });
}

// ------------------------------------------------------------------ pause

/**
 * Round 9, group 9: one switch that stops everything automatic at once:
 * AI searches (n8n claims nothing), the assistant's model (rules answers),
 * automatic emails and texts, and drafted replies (n8n claims and drafts are
 * refused). Read fresh on every call, so it takes effect immediately; staff
 * can still answer by hand. Every change audited.
 */
const PAUSE_KEY = "pause";

export interface PauseState {
  paused: boolean;
  since: string | null;
  by: string | null;
}

export async function pauseState(): Promise<PauseState> {
  const row = await prisma.appSetting.findUnique({ where: { key: PAUSE_KEY } });
  try {
    const v = JSON.parse(row?.value ?? "{}") as { paused?: unknown; since?: unknown };
    return { paused: v.paused === true, since: typeof v.since === "string" ? v.since : null, by: row?.updatedById ?? null };
  } catch {
    // A corrupt value counts as paused (fail safe), like an unreadable one.
    return { paused: true, since: null, by: row?.updatedById ?? null };
  }
}

/** True while paused. Never throws: an unreadable setting counts as paused (fail safe). */
export async function isPaused(): Promise<boolean> {
  try {
    return (await pauseState()).paused;
  } catch {
    return true;
  }
}

export async function setPaused(adminId: string, paused: boolean, now = new Date()): Promise<void> {
  const before = await pauseState();
  // A second click (or a stale page) with the same state changes nothing and logs nothing.
  if (before.paused === paused) return;
  const value = JSON.stringify({ paused, since: paused ? now.toISOString() : null });
  // The switch and its audit entry together: neither exists without the other.
  await prisma.$transaction(async (tx) => {
    await tx.appSetting.upsert({
      where: { key: PAUSE_KEY },
      create: { key: PAUSE_KEY, value, updatedById: adminId },
      update: { value, updatedById: adminId },
    });
    await audit({ actorUserId: adminId, action: paused ? "admin.pause.on" : "admin.pause.off", resourceType: "AppSetting", resourceId: PAUSE_KEY, before: { paused: before.paused }, after: { paused } }, tx);
  });
}

// ------------------------------------------------------------ search access

/**
 * Round 10, group 3 (founder): "AI searches are open to" in Admin > Controls.
 * "test_only" by default and whenever the value is missing or unreadable
 * (fail safe). Read fresh on every check, every change audited.
 */
const SEARCH_ACCESS_KEY = "search.access";

export async function searchAccess(
  db: { appSetting: Pick<typeof prisma.appSetting, "findUnique"> } = prisma
): Promise<SearchAccess> {
  try {
    // Inside a transaction, pass it: a second connection would wait on it.
    const row = await db.appSetting.findUnique({ where: { key: SEARCH_ACCESS_KEY } });
    const v = JSON.parse(row?.value ?? "{}") as { access?: unknown };
    return isSearchAccess(v.access) ? v.access : "test_only";
  } catch {
    return "test_only";
  }
}

export async function setSearchAccess(adminId: string, access: SearchAccess): Promise<void> {
  const before = await searchAccess();
  if (before === access) return;
  const value = JSON.stringify({ access, since: new Date().toISOString() });
  await prisma.$transaction(async (tx) => {
    await tx.appSetting.upsert({
      where: { key: SEARCH_ACCESS_KEY },
      create: { key: SEARCH_ACCESS_KEY, value, updatedById: adminId },
      update: { value, updatedById: adminId },
    });
    await audit({ actorUserId: adminId, action: "admin.search.access", resourceType: "AppSetting", resourceId: SEARCH_ACCESS_KEY, before: { access: before }, after: { access } }, tx);
  });
}
