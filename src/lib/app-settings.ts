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
 * Round 11.1: this decides who may QUEUE a search, and "all_verified" (every
 * performer with a verified email and a 100% profile) is the default when no
 * value is stored or it is unreadable. Queuing costs nothing: whether a search
 * RUNS is the "Run searches" switch below plus WORKFLOW_MODE (Test accounts
 * only in test mode), never this setting. "test_only" stays readable and
 * selectable. Read fresh on every check, every change audited.
 */
export const DEFAULT_SEARCH_ACCESS: SearchAccess = "all_verified";
const SEARCH_ACCESS_KEY = "search.access";

export async function searchAccess(
  db: { appSetting: Pick<typeof prisma.appSetting, "findUnique"> } = prisma
): Promise<SearchAccess> {
  // Inside a transaction, pass it: a second connection would wait on it. A
  // database error is thrown (the caller's transaction is aborted anyway); only
  // an unreadable value falls back on Test accounts only.
  const row = await db.appSetting.findUnique({ where: { key: SEARCH_ACCESS_KEY } });
  try {
    const v = JSON.parse(row?.value ?? "{}") as { access?: unknown };
    return isSearchAccess(v.access) ? v.access : DEFAULT_SEARCH_ACCESS;
  } catch {
    return DEFAULT_SEARCH_ACCESS;
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
  if (access === "all_verified") await launchWaitingFirstSearches();
}

// ------------------------------------------------------------ run searches

/**
 * Round 11.1 (founder): "Run searches" in Admin > Controls. Off by default, and
 * off whenever the value is missing or unreadable (fail safe: no cost). While
 * off, every search is created in the queue and stays there: the n8n claim
 * hands out nothing, so nothing reaches n8n. On, WORKFLOW_MODE still decides
 * which accounts run (Test accounts only in test mode). Same pattern as the
 * pause switch: read fresh, every change audited with the switch itself.
 */
const SEARCH_RUN_KEY = "search.run";

export interface SearchRunState {
  running: boolean;
  since: string | null;
  by: string | null;
}

export async function searchRunState(
  db: { appSetting: Pick<typeof prisma.appSetting, "findUnique"> } = prisma
): Promise<SearchRunState> {
  const row = await db.appSetting.findUnique({ where: { key: SEARCH_RUN_KEY } });
  try {
    const v = JSON.parse(row?.value ?? "{}") as { running?: unknown; since?: unknown };
    return { running: v.running === true, since: typeof v.since === "string" ? v.since : null, by: row?.updatedById ?? null };
  } catch {
    return { running: false, since: null, by: row?.updatedById ?? null };
  }
}

/** True only when staff turned "Run searches" on. Never throws: an error means off. */
export async function searchesRunning(
  db: { appSetting: Pick<typeof prisma.appSetting, "findUnique"> } = prisma
): Promise<boolean> {
  try {
    return (await searchRunState(db)).running;
  } catch {
    return false;
  }
}

export async function setSearchesRunning(adminId: string, running: boolean, now = new Date()): Promise<void> {
  const before = await searchRunState();
  if (before.running === running) return;
  const value = JSON.stringify({ running, since: now.toISOString() });
  await prisma.$transaction(async (tx) => {
    await tx.appSetting.upsert({
      where: { key: SEARCH_RUN_KEY },
      create: { key: SEARCH_RUN_KEY, value, updatedById: adminId },
      update: { value, updatedById: adminId },
    });
    await audit({ actorUserId: adminId, action: running ? "admin.searchRun.on" : "admin.searchRun.off", resourceType: "AppSetting", resourceId: SEARCH_RUN_KEY, before: { running: before.running }, after: { running } }, tx);
  });
  // Performers who reached 100% before queuing opened get their first search now.
  if (running && (await searchAccess()) === "all_verified") await launchWaitingFirstSearches();
}

/**
 * Round 10: opening searches to everyone starts the first automatic search of
 * every performer who was waiting for it (verified, 100%, never searched), as
 * reaching 100% would have. launchFirstAutoSearch checks each one again.
 */
async function launchWaitingFirstSearches(): Promise<number> {
  const { launchFirstAutoSearch } = await import("@/lib/auto-search");
  const waiting = await prisma.user.findMany({
    where: { kind: "TALENT", deletedAt: null, roleSearchRequests: { none: {} } },
    select: { id: true },
    take: 2000,
  });
  let started = 0;
  for (const u of waiting) {
    const res = await launchFirstAutoSearch(u.id).catch(() => null);
    if (res?.ok) started += 1;
  }
  return started;
}

// ------------------------------------------------- email verification gate

/**
 * Round 11 (founder): "Email verification required before the dashboard" in
 * Admin > Controls. Off by default, and off whenever the value is missing or
 * unreadable: a broken setting must never lock people out. Turned on only once
 * sign-up codes really arrive. Read fresh on every page, every change audited.
 */
const EMAIL_GATE_KEY = "email.verification.required";

export async function emailVerificationRequired(
  db: { appSetting: Pick<typeof prisma.appSetting, "findUnique"> } = prisma
): Promise<boolean> {
  try {
    const row = await db.appSetting.findUnique({ where: { key: EMAIL_GATE_KEY } });
    const v = JSON.parse(row?.value ?? "{}") as { required?: unknown };
    return v.required === true;
  } catch {
    return false;
  }
}

export async function emailGateState(): Promise<{ required: boolean; since: string | null }> {
  const row = await prisma.appSetting.findUnique({ where: { key: EMAIL_GATE_KEY } });
  try {
    const v = JSON.parse(row?.value ?? "{}") as { required?: unknown; since?: unknown };
    return { required: v.required === true, since: typeof v.since === "string" ? v.since : null };
  } catch {
    return { required: false, since: null };
  }
}

export async function setEmailVerificationRequired(adminId: string, required: boolean, now = new Date()): Promise<void> {
  const before = await emailVerificationRequired();
  if (before === required) return;
  const value = JSON.stringify({ required, since: now.toISOString() });
  await prisma.$transaction(async (tx) => {
    await tx.appSetting.upsert({
      where: { key: EMAIL_GATE_KEY },
      create: { key: EMAIL_GATE_KEY, value, updatedById: adminId },
      update: { value, updatedById: adminId },
    });
    await audit({ actorUserId: adminId, action: required ? "admin.emailGate.on" : "admin.emailGate.off", resourceType: "AppSetting", resourceId: EMAIL_GATE_KEY, before: { required: before }, after: { required } }, tx);
  });
}
