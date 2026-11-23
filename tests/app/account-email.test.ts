import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import enApp from "../../messages/en/app.json";
import frApp from "../../messages/fr/app.json";
import esApp from "../../messages/es/app.json";
import zhApp from "../../messages/zh/app.json";

/**
 * The email verification and password reset actions.
 *
 * Mocked: the session, the request headers, `after`, the mailer and Prisma.
 * The mailer mock means no test here can send anything. Prisma is an
 * in-memory stand-in for the three tables involved, so the real token and
 * rate-limit modules run against it and a test can ask what a link is still
 * worth after an action. The stand-in keeps separate spies for the client and
 * for the transaction client, which is how a test tells where a write went.
 */

type SessionLike = { user?: { id?: string } } | null;

type UserRow = {
  id: string;
  email: string;
  locale: string;
  emailVerified: Date | null;
  passwordHash: string | null;
  createdAt: Date;
  sessionsValidAfter: Date | null;
};
type TokenRow = { identifier: string; token: string; expires: Date };
type EventRow = { key: string; createdAt: Date };
type TokenWhere = { identifier?: string; token?: string };
type EventWhere = { key: string; createdAt: { gt?: Date; lte?: Date } };
type Work = () => Promise<void>;

const NOW = new Date("2026-11-19T10:00:00Z");
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const SITE = "https://www.agental.test";
const STRONG = "Str0ng!password";

const state: {
  session: SessionLike;
  headers: Record<string, string>;
  deferred: Work[];
} = { session: null, headers: {}, deferred: [] };

const store: {
  users: UserRow[];
  tokens: TokenRow[];
  events: EventRow[];
  /** Every database call, in order, as "table.method". */
  log: string[];
} = { users: [], tokens: [], events: [], log: [] };

const tokenMatches = (row: TokenRow, where: TokenWhere) =>
  (where.identifier === undefined || row.identifier === where.identifier) &&
  (where.token === undefined || row.token === where.token);

function eventMatches(row: EventRow, where: EventWhere): boolean {
  if (row.key !== where.key) return false;
  const { gt, lte } = where.createdAt;
  if (gt && !(row.createdAt.getTime() > gt.getTime())) return false;
  if (lte && !(row.createdAt.getTime() <= lte.getTime())) return false;
  return true;
}

function userDelegate() {
  return {
    findUnique: vi.fn(async (args: { where: { id: string } }) => {
      store.log.push("user.findUnique");
      return store.users.find((u) => u.id === args.where.id) ?? null;
    }),
    findMany: vi.fn(async (args: { where: { email: { equals: string } } }) => {
      store.log.push("user.findMany");
      return store.users.filter((u) => u.email.toLowerCase() === args.where.email.equals);
    }),
    updateMany: vi.fn(
      async (args: { where: { id: string; emailVerified?: null }; data: Partial<UserRow> }) => {
        store.log.push("user.updateMany");
        const hit = store.users.filter(
          (u) =>
            u.id === args.where.id &&
            (!("emailVerified" in args.where) || u.emailVerified === null)
        );
        for (const user of hit) Object.assign(user, args.data);
        return { count: hit.length };
      }
    ),
    create: vi.fn(async (args: { data: { email: string; passwordHash: string; locale: string } }) => {
      store.log.push("user.create");
      const row: UserRow = {
        id: "new-1",
        email: args.data.email,
        locale: args.data.locale,
        passwordHash: args.data.passwordHash,
        emailVerified: null,
        createdAt: new Date(),
        sessionsValidAfter: null,
      };
      store.users.push(row);
      return row;
    }),
  };
}

function tokenDelegate() {
  return {
    findFirst: vi.fn(async (args: { where: TokenWhere }) => {
      store.log.push("verificationToken.findFirst");
      const row = store.tokens.find((r) => tokenMatches(r, args.where));
      return row ? { identifier: row.identifier, expires: row.expires } : null;
    }),
    create: vi.fn(async (args: { data: TokenRow }) => {
      store.log.push("verificationToken.create");
      store.tokens.push({ ...args.data });
      return args.data;
    }),
    deleteMany: vi.fn(async (args: { where: TokenWhere }) => {
      store.log.push("verificationToken.deleteMany");
      const kept = store.tokens.filter((r) => !tokenMatches(r, args.where));
      const count = store.tokens.length - kept.length;
      store.tokens.splice(0, store.tokens.length, ...kept);
      return { count };
    }),
  };
}

const rateLimitEvent = {
  findMany: vi.fn(async (args: { where: EventWhere; take: number }) => {
    store.log.push("rateLimitEvent.findMany");
    return store.events
      .filter((row) => eventMatches(row, args.where))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, args.take)
      .map((row) => ({ createdAt: row.createdAt }));
  }),
  create: vi.fn(async (args: { data: EventRow }) => {
    store.log.push("rateLimitEvent.create");
    store.events.push({ ...args.data });
    return args.data;
  }),
  deleteMany: vi.fn(async (args: { where: EventWhere }) => {
    store.log.push("rateLimitEvent.deleteMany");
    const kept = store.events.filter((row) => !eventMatches(row, args.where));
    const count = store.events.length - kept.length;
    store.events.splice(0, store.events.length, ...kept);
    return { count };
  }),
};

type AuditArgs = { data: Record<string, string> };

/** The transaction client: its own spies over the same rows. */
const tx = {
  user: userDelegate(),
  verificationToken: tokenDelegate(),
  auditLog: { create: vi.fn<(args: AuditArgs) => Promise<object>>(async () => ({})) },
};

const db = {
  user: userDelegate(),
  verificationToken: tokenDelegate(),
  rateLimitEvent,
  auditLog: { create: vi.fn<(args: AuditArgs) => Promise<object>>(async () => ({})) },
  $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
};

type Sent = { ok: true; mode: "resend" | "log" } | { ok: false };
type Message = { to: string; subject: string; text: string; html: string };

const sendEmail = vi.fn<(message: Message) => Promise<Sent>>(async () => ({
  ok: true,
  mode: "resend",
}));
const emailSenderConfigured = vi.fn(() => true);
const after = vi.fn((work: Work) => {
  state.deferred.push(work);
});
const signIn = vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined);

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/auth", () => ({
  auth: async () => state.session,
  signIn,
  signOut: vi.fn(),
}));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => state.headers[name.toLowerCase()] ?? null,
  }),
}));
vi.mock("next/server", () => ({ after }));
vi.mock("@/lib/mailer", () => ({ sendEmail, emailSenderConfigured }));
// Round 10: sign-up sends a 6-digit code (src/lib/email-code.ts, tested on its own).
const { sendEmailCode } = vi.hoisted(() => ({ sendEmailCode: vi.fn() }));
vi.mock("@/lib/email-code", () => ({ sendEmailCode }));
vi.mock("@/lib/consent", () => ({ readConsentCookie: async () => null }));

const {
  requestEmailVerification,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  sendVerificationForNewUser,
} = await import("@/app/actions/account-email");
const { signupAction } = await import("@/app/actions/auth");
const { RESET_TTL_MS, VERIFY_TTL_MS, createEmailToken, hashEmailToken } = await import(
  "@/lib/email-tokens"
);

const emails = { en: enApp.emails, fr: frApp.emails, es: esApp.emails, zh: zhApp.emails };

function user(over: Partial<UserRow> = {}): UserRow {
  const row: UserRow = {
    id: "u1",
    email: "ana@example.com",
    locale: "fr",
    emailVerified: null,
    passwordHash: "$2b$10$existing-hash",
    createdAt: new Date("2026-11-01T08:00:00Z"),
    sessionsValidAfter: null,
    ...over,
  };
  store.users.push(row);
  return row;
}

/** A real token for `userId`, issued through the real module. */
async function issue(purpose: "verify" | "reset", userId = "u1", now = NOW): Promise<string> {
  const token = await createEmailToken(db as never, {
    purpose,
    userId,
    ttlMs: purpose === "verify" ? VERIFY_TTL_MS : RESET_TTL_MS,
    now,
  });
  vi.clearAllMocks();
  store.log.length = 0;
  return token;
}

const sent = () => sendEmail.mock.calls.map(([message]) => message);
const linkIn = (message: Message) =>
  message.text.split("\n").find((line) => line.startsWith("http")) ?? "";
const tokenIn = (message: Message) => new URL(linkIn(message)).searchParams.get("token") ?? "";

/** Run what the actions scheduled with `after`, as the host would once the response left. */
async function flushDeferred(): Promise<void> {
  const work = state.deferred.splice(0, state.deferred.length);
  for (const run of work) await run();
}

const at = (ms: number) => vi.setSystemTime(new Date(NOW.getTime() + ms));

let errorLog: ReturnType<typeof vi.spyOn>;
const errorLines = () =>
  errorLog.mock.calls.map((call: unknown[]) => call.map(String).join(" ")).join("\n");

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("AUTH_SECRET", "test-secret-with-enough-entropy");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  vi.stubEnv("AUTH_URL", "");
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  state.session = null;
  state.headers = {
    host: "www.agental.test",
    "x-forwarded-proto": "https",
    "x-real-ip": "203.0.113.7",
  };
  state.deferred = [];
  store.users = [];
  store.tokens = [];
  store.events = [];
  store.log = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("requestEmailVerification", () => {
  it("refuses a visitor who is not signed in, without touching the database", async () => {
    user();
    expect(await requestEmailVerification()).toEqual({
      ok: false,
      error: { key: "errors.unauthorized" },
    });
    expect(store.log).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses a session without a user id", async () => {
    state.session = { user: {} };
    expect(await requestEmailVerification()).toEqual({
      ok: false,
      error: { key: "errors.unauthorized" },
    });
    expect(store.log).toEqual([]);
  });

  it("refuses a session whose account is gone", async () => {
    state.session = { user: { id: "deleted" } };
    expect(await requestEmailVerification()).toEqual({
      ok: false,
      error: { key: "errors.unauthorized" },
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it.each([
    { label: "a confirmed address", over: { emailVerified: new Date("2026-11-02T08:00:00Z") } },
    { label: "an account with no password (Google or Apple)", over: { passwordHash: null } },
  ])("answers already verified for $label, counting and sending nothing", async ({ over }) => {
    user(over);
    state.session = { user: { id: "u1" } };

    expect(await requestEmailVerification()).toEqual({ ok: true, alreadyVerified: true });

    expect(store.events).toEqual([]);
    expect(store.tokens).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("stores a token for 24 hours and emails its link to the stored address", async () => {
    user();
    state.session = { user: { id: "u1" } };

    expect(await requestEmailVerification()).toEqual({ ok: true, alreadyVerified: false });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [message] = sent();
    expect(message.to).toBe("ana@example.com");
    expect(message.subject).toBe(frApp.emails.verifySubject);
    expect(linkIn(message)).toMatch(
      /^https:\/\/www\.agental\.test\/fr\/verifier\?token=[A-Za-z0-9_-]{43}$/
    );
    expect(message.html).toContain(linkIn(message));
    // The database holds the hash of the emailed token, under this user.
    expect(store.tokens).toEqual([
      {
        identifier: "verify:u1",
        token: hashEmailToken(tokenIn(message)),
        expires: new Date(NOW.getTime() + 24 * HOUR),
      },
    ]);
    expect(JSON.stringify(store.tokens)).not.toContain(tokenIn(message));
  });

  it.each(["en", "fr", "es", "zh"] as const)("writes in the user's language: %s", async (locale) => {
    user({ locale });
    state.session = { user: { id: "u1" } };

    await requestEmailVerification();

    const [message] = sent();
    expect(message.subject).toBe(emails[locale].verifySubject);
    expect(message.text).toContain(emails[locale].verifyIntro);
    expect(linkIn(message)).toContain(`/${locale}/verifier?token=`);
  });

  it("falls back to English for a locale the site does not have", async () => {
    user({ locale: "de" });
    state.session = { user: { id: "u1" } };
    await requestEmailVerification();
    expect(sent()[0].subject).toBe(enApp.emails.verifySubject);
    expect(linkIn(sent()[0])).toContain("/en/verifier?token=");
  });

  it("replaces the earlier link: one works at a time", async () => {
    user();
    state.session = { user: { id: "u1" } };
    await requestEmailVerification();
    at(2 * MINUTE);
    await requestEmailVerification();

    const [first, second] = sent().map(tokenIn);
    expect(store.tokens).toHaveLength(1);
    expect(await verifyEmail(first)).toEqual({
      ok: false,
      error: { key: "errors.emailLinkInvalid" },
    });
    expect(await verifyEmail(second)).toEqual({ ok: true });
  });

  it("allows one email per 60 seconds", async () => {
    user();
    state.session = { user: { id: "u1" } };

    expect(await requestEmailVerification()).toMatchObject({ ok: true });
    at(59_999);
    expect(await requestEmailVerification()).toEqual({
      ok: false,
      error: { key: "errors.tooManyAttempts" },
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(store.tokens).toHaveLength(1);

    at(60_000);
    expect(await requestEmailVerification()).toMatchObject({ ok: true });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("allows five emails per hour", async () => {
    user();
    state.session = { user: { id: "u1" } };

    for (let i = 0; i < 5; i++) {
      at(i * 2 * MINUTE);
      expect(await requestEmailVerification()).toMatchObject({ ok: true });
    }
    at(30 * MINUTE);
    expect(await requestEmailVerification()).toEqual({
      ok: false,
      error: { key: "errors.tooManyAttempts" },
    });
    expect(sendEmail).toHaveBeenCalledTimes(5);

    // One hour after the first email, a slot is free again.
    at(HOUR);
    expect(await requestEmailVerification()).toMatchObject({ ok: true });
    expect(sendEmail).toHaveBeenCalledTimes(6);
  });

  it("counts per user, and a click refused by the minute limit leaves the hourly count alone", async () => {
    user();
    user({ id: "u2", email: "bob@example.com" });
    state.session = { user: { id: "u1" } };

    await requestEmailVerification();
    await requestEmailVerification();
    await requestEmailVerification();

    expect(store.events.map((e) => e.key).sort()).toEqual([
      "email-verify:hour:u1",
      "email-verify:minute:u1",
    ]);

    // Another user is not slowed down by the first one.
    state.session = { user: { id: "u2" } };
    expect(await requestEmailVerification()).toMatchObject({ ok: true });
  });

  it("answers emailSendFailed when the mailer answers not ok", async () => {
    user();
    state.session = { user: { id: "u1" } };
    sendEmail.mockResolvedValueOnce({ ok: false });

    expect(await requestEmailVerification()).toEqual({
      ok: false,
      error: { key: "errors.emailSendFailed" },
    });
  });

  it("answers ok in development when the mailer only logged the link", async () => {
    user();
    state.session = { user: { id: "u1" } };
    vi.stubEnv("NODE_ENV", "development");
    sendEmail.mockResolvedValueOnce({ ok: true, mode: "log" });

    expect(await requestEmailVerification()).toEqual({ ok: true, alreadyVerified: false });
  });

  it("answers emailSendFailed in production when no sender exists: nothing reached anyone", async () => {
    user();
    state.session = { user: { id: "u1" } };
    vi.stubEnv("NODE_ENV", "production");
    sendEmail.mockResolvedValueOnce({ ok: true, mode: "log" });

    expect(await requestEmailVerification()).toEqual({
      ok: false,
      error: { key: "errors.emailSendFailed" },
    });
  });

  it("answers emailSendFailed, with no token, when the site URL cannot be known", async () => {
    user();
    state.session = { user: { id: "u1" } };
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    state.headers = {};

    expect(await requestEmailVerification()).toEqual({
      ok: false,
      error: { key: "errors.emailSendFailed" },
    });
    expect(store.tokens).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(errorLines()).toContain("The site URL is unknown");
  });

  it("builds the link from the request on a deployment with no site variable", async () => {
    user();
    state.session = { user: { id: "u1" } };
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    state.headers = { host: "preview-abc.agental.test", "x-forwarded-proto": "https" };

    await requestEmailVerification();
    expect(linkIn(sent()[0])).toContain("https://preview-abc.agental.test/fr/verifier?token=");
  });
});

describe("verifyEmail", () => {
  it("confirms the address with no session, and audits it in the same transaction", async () => {
    const row = user();
    const token = await issue("verify");

    expect(await verifyEmail(token)).toEqual({ ok: true });

    expect(row.emailVerified).toEqual(NOW);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: "u1", emailVerified: null },
      data: { emailVerified: NOW },
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({
      actorUserId: "u1",
      action: "auth.email.verified",
      resourceType: "User",
      resourceId: "u1",
    });
    expect(db.auditLog.create).not.toHaveBeenCalled();
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("uses the link up: the second click is invalid", async () => {
    user();
    const token = await issue("verify");

    expect(await verifyEmail(token)).toEqual({ ok: true });
    expect(store.tokens).toEqual([]);
    expect(await verifyEmail(token)).toEqual({
      ok: false,
      error: { key: "errors.emailLinkInvalid" },
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("answers emailLinkExpired after 24 hours, writes nothing, and the link is gone", async () => {
    const row = user();
    const token = await issue("verify");
    at(24 * HOUR);

    expect(await verifyEmail(token)).toEqual({
      ok: false,
      error: { key: "errors.emailLinkExpired" },
    });
    expect(row.emailVerified).toBeNull();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(store.tokens).toEqual([]);
  });

  it("still works one millisecond before the 24 hours are over", async () => {
    user();
    const token = await issue("verify");
    at(24 * HOUR - 1);
    expect(await verifyEmail(token)).toEqual({ ok: true });
  });

  it("answers emailLinkInvalid for a well-formed token nobody issued", async () => {
    const row = user();
    await issue("verify");

    expect(await verifyEmail(Buffer.alloc(32, 7).toString("base64url"))).toEqual({
      ok: false,
      error: { key: "errors.emailLinkInvalid" },
    });
    expect(row.emailVerified).toBeNull();
    expect(store.tokens).toHaveLength(1);
  });

  it.each([
    { label: "an empty string", token: "" },
    { label: "a short string", token: "abc" },
    { label: "null", token: null },
    { label: "an object", token: { $gt: "" } },
  ])("answers emailLinkInvalid for $label without a query", async ({ token }) => {
    expect(await verifyEmail(token as never)).toEqual({
      ok: false,
      error: { key: "errors.emailLinkInvalid" },
    });
    expect(store.log).toEqual([]);
  });

  it("refuses a password reset link, and leaves it usable for its own page", async () => {
    const row = user();
    const token = await issue("reset");

    expect(await verifyEmail(token)).toEqual({
      ok: false,
      error: { key: "errors.emailLinkInvalid" },
    });
    expect(row.emailVerified).toBeNull();
    expect(store.tokens).toHaveLength(1);
  });

  it("answers ok and writes nothing when the address was confirmed in the meantime", async () => {
    const earlier = new Date("2026-11-18T08:00:00Z");
    const row = user({ emailVerified: earlier });
    const token = await issue("verify");

    expect(await verifyEmail(token)).toEqual({ ok: true });
    expect(row.emailVerified).toEqual(earlier);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("answers emailLinkInvalid when the account was deleted after the email left", async () => {
    const token = await issue("verify", "deleted");

    expect(await verifyEmail(token)).toEqual({
      ok: false,
      error: { key: "errors.emailLinkInvalid" },
    });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("requestPasswordReset", () => {
  it("emails a one hour link to the account, once the response has left", async () => {
    user({ locale: "es" });

    expect(await requestPasswordReset("ana@example.com")).toEqual({ ok: true });

    // The account stays untouched until the answer has left.
    expect(after).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(store.tokens).toEqual([]);

    await flushDeferred();

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [message] = sent();
    expect(message.to).toBe("ana@example.com");
    expect(message.subject).toBe(esApp.emails.resetSubject);
    expect(message.text).toContain(esApp.emails.resetIntro);
    expect(linkIn(message)).toMatch(
      /^https:\/\/www\.agental\.test\/es\/reinitialiser\?token=[A-Za-z0-9_-]{43}$/
    );
    expect(store.tokens).toEqual([
      {
        identifier: "reset:u1",
        token: hashEmailToken(tokenIn(message)),
        expires: new Date(NOW.getTime() + HOUR),
      },
    ]);
  });

  it("answers the same for an unknown address, and sends nothing", async () => {
    user();

    expect(await requestPasswordReset("nobody@example.com")).toEqual({ ok: true });
    await flushDeferred();

    expect(sendEmail).not.toHaveBeenCalled();
    expect(store.tokens).toEqual([]);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("does the same work before the answer for a known and an unknown address", async () => {
    user();

    const known = await requestPasswordReset("ana@example.com");
    const knownWork = [...store.log];
    expect(after).toHaveBeenCalledTimes(1);

    store.log = [];
    const unknown = await requestPasswordReset("nobody@example.com");
    const unknownWork = [...store.log];

    expect(unknown).toEqual(known);
    expect(unknownWork).toEqual(knownWork);
    expect(after).toHaveBeenCalledTimes(2);
    // The account lookup is part of the deferred work for both, so the
    // response time cannot depend on whether a row exists.
    expect(knownWork.every((call) => call.startsWith("rateLimitEvent."))).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("finds the account whatever the letter case and spacing typed", async () => {
    user();
    expect(await requestPasswordReset("  Ana@Example.COM ")).toEqual({ ok: true });
    await flushDeferred();

    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: "ana@example.com", mode: "insensitive" } },
      })
    );
    expect(sent().map((m) => m.to)).toEqual(["ana@example.com"]);
  });

  it("sends nothing when several accounts hold the address", async () => {
    user({ id: "old", email: "Ana@Example.com" });
    user({ id: "new", email: "ana@example.com" });

    expect(await requestPasswordReset("ana@example.com")).toEqual({ ok: true });
    await flushDeferred();

    expect(sendEmail).not.toHaveBeenCalled();
    expect(store.tokens).toEqual([]);
  });

  it("serves an account that has no password yet: the mailbox owner may set one", async () => {
    user({ passwordHash: null, emailVerified: new Date("2026-11-02T08:00:00Z") });
    await requestPasswordReset("ana@example.com");
    await flushDeferred();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: "an empty string", email: "" },
    { label: "a word", email: "not-an-email" },
    { label: "a missing domain", email: "ana@" },
    { label: "two addresses", email: "ana@example.com, bob@example.com" },
    { label: "an address over 320 characters", email: `${"a".repeat(320)}@example.com` },
    { label: "null", email: null },
    { label: "a number", email: 42 },
    { label: "an object", email: { email: "ana@example.com" } },
  ])("answers invalidInput for $label, counting and scheduling nothing", async ({ email }) => {
    expect(await requestPasswordReset(email as never)).toEqual({
      ok: false,
      error: { key: "errors.invalidInput" },
    });
    expect(store.log).toEqual([]);
    expect(after).not.toHaveBeenCalled();
  });

  it("allows three requests per hour per address, and still answers ok beyond", async () => {
    user();

    for (let i = 0; i < 3; i++) {
      at(i * MINUTE);
      expect(await requestPasswordReset("ana@example.com")).toEqual({ ok: true });
    }
    expect(after).toHaveBeenCalledTimes(3);

    at(10 * MINUTE);
    // Another letter case is the same address.
    expect(await requestPasswordReset("ANA@example.com")).toEqual({ ok: true });
    expect(after).toHaveBeenCalledTimes(3);
    await flushDeferred();
    expect(sendEmail).toHaveBeenCalledTimes(3);

    // Another address is unaffected.
    user({ id: "u2", email: "bob@example.com" });
    expect(await requestPasswordReset("bob@example.com")).toEqual({ ok: true });
    expect(after).toHaveBeenCalledTimes(4);

    // One hour after the first request, a slot is free again.
    at(HOUR);
    expect(await requestPasswordReset("ana@example.com")).toEqual({ ok: true });
    expect(after).toHaveBeenCalledTimes(5);
  });

  it("allows ten requests per hour per IP, and still answers ok beyond", async () => {
    for (let i = 0; i < 10; i++) {
      expect(await requestPasswordReset(`person${i}@example.com`)).toEqual({ ok: true });
    }
    expect(after).toHaveBeenCalledTimes(10);

    user();
    const eventsBefore = store.events.length;
    expect(await requestPasswordReset("ana@example.com")).toEqual({ ok: true });
    expect(after).toHaveBeenCalledTimes(10);
    // Refused at the IP: nothing was counted against the address either.
    expect(store.events).toHaveLength(eventsBefore);
    await flushDeferred();
    expect(sendEmail).not.toHaveBeenCalled();

    // Another IP is unaffected.
    state.headers["x-real-ip"] = "198.51.100.4";
    expect(await requestPasswordReset("ana@example.com")).toEqual({ ok: true });
    expect(after).toHaveBeenCalledTimes(11);
    await flushDeferred();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("keys the limits by hashes: no address and no IP is stored", async () => {
    await requestPasswordReset("ana@example.com");

    const keys = store.events.map((e) => e.key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^pw-reset:ip:[0-9a-f]{64}$/);
    expect(keys[1]).toMatch(/^pw-reset:email:[0-9a-f]{64}$/);
    const stored = JSON.stringify(store.events);
    expect(stored).not.toContain("ana");
    expect(stored).not.toContain("example.com");
    expect(stored).not.toContain("203.0.113.7");
  });

  it("reads the IP from x-real-ip first, then from the first x-forwarded-for hop", async () => {
    const ipKey = () => store.events.find((e) => e.key.startsWith("pw-reset:ip:"))?.key;

    state.headers = { host: "www.agental.test", "x-real-ip": "198.51.100.4" };
    await requestPasswordReset("a@example.com");
    const fromRealIp = ipKey();

    store.events = [];
    state.headers = { host: "www.agental.test", "x-forwarded-for": "198.51.100.4, 10.0.0.1" };
    await requestPasswordReset("b@example.com");
    expect(ipKey()).toBe(fromRealIp);

    store.events = [];
    state.headers = {
      host: "www.agental.test",
      "x-real-ip": "198.51.100.4",
      "x-forwarded-for": "192.0.2.99",
    };
    await requestPasswordReset("c@example.com");
    expect(ipKey()).toBe(fromRealIp);

    store.events = [];
    state.headers = { host: "www.agental.test", "x-real-ip": "192.0.2.99" };
    await requestPasswordReset("d@example.com");
    expect(ipKey()).not.toBe(fromRealIp);
  });

  it("puts requests with no IP header in one shared bucket", async () => {
    state.headers = { host: "www.agental.test" };
    for (let i = 0; i < 10; i++) await requestPasswordReset(`person${i}@example.com`);
    expect(after).toHaveBeenCalledTimes(10);

    expect(await requestPasswordReset("ana@example.com")).toEqual({ ok: true });
    expect(after).toHaveBeenCalledTimes(10);
  });

  it("answers ok when the mailer fails, and logs no address", async () => {
    user();
    sendEmail.mockResolvedValueOnce({ ok: false });

    expect(await requestPasswordReset("ana@example.com")).toEqual({ ok: true });
    await flushDeferred();

    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(errorLines()).not.toMatch(/ana|example\.com/);
  });

  it("answers ok when the deferred work throws, and logs the error class only", async () => {
    user();
    db.user.findMany.mockRejectedValueOnce(
      new Error("Invalid `prisma.user.findMany()` invocation: equals: \"ana@example.com\"")
    );

    expect(await requestPasswordReset("ana@example.com")).toEqual({ ok: true });
    await expect(flushDeferred()).resolves.toBeUndefined();

    expect(sendEmail).not.toHaveBeenCalled();
    expect(errorLines()).toContain("Error");
    expect(errorLines()).not.toMatch(/ana|example\.com/);
  });

  it("answers ok and schedules nothing when the site URL cannot be known", async () => {
    user();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    state.headers = { "x-real-ip": "203.0.113.7" };

    expect(await requestPasswordReset("ana@example.com")).toEqual({ ok: true });
    expect(after).not.toHaveBeenCalled();
    expect(errorLines()).toContain("The site URL is unknown");
  });

  it("still answers ok, and still sends, where after() is unavailable", async () => {
    user();
    after.mockImplementationOnce(() => {
      throw new Error("`after()` will not work correctly, because `waitUntil` is not available");
    });

    expect(await requestPasswordReset("ana@example.com")).toEqual({ ok: true });
    // The work was started without being awaited. Its steps are all mocked,
    // so one turn of the event loop is enough for it to finish.
    await new Promise((resolve) => setImmediate(resolve));
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("resetPassword", () => {
  it.each([
    { label: "too short", password: "Ab!4567", key: "errors.passwordTooShort" },
    { label: "without an uppercase letter", password: "str0ng!password", key: "errors.passwordNeedsUppercase" },
    { label: "without a special character", password: "Str0ngpassword", key: "errors.passwordNeedsSpecial" },
    { label: "that is not a string", password: 12345678, key: "errors.invalidInput" },
  ])("refuses a password $label, and the link is not used up", async ({ password, key }) => {
    const row = user();
    const token = await issue("reset");

    expect(await resetPassword(token, password as never)).toEqual({
      ok: false,
      error: { key },
    });

    // The token was never looked at, let alone deleted.
    expect(store.log).toEqual([]);
    expect(store.tokens).toHaveLength(1);
    expect(row.passwordHash).toBe("$2b$10$existing-hash");
    // The same link then takes a password that passes.
    expect(await resetPassword(token, STRONG)).toEqual({ ok: true });
  });

  it("sets the password, ends every session and audits, all in one transaction", async () => {
    const row = user();
    const token = await issue("reset");

    expect(await resetPassword(token, STRONG)).toEqual({ ok: true });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    // Every write went through the transaction client.
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();

    const written = tx.user.updateMany.mock.calls[0][0];
    expect(written).toEqual({
      where: { id: "u1" },
      data: { passwordHash: expect.any(String), sessionsValidAfter: NOW },
    });
    const hash = written.data.passwordHash as string;
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
    expect(await bcrypt.compare(STRONG, hash)).toBe(true);
    expect(row.passwordHash).toBe(hash);

    // Sessions that began before this instant are refused by src/auth.ts.
    expect(row.sessionsValidAfter).toEqual(NOW);

    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = tx.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      actorUserId: "u1",
      action: "auth.password.reset",
      resourceType: "User",
      resourceId: "u1",
    });
    expect(JSON.parse(audit.after)).toEqual({ sessionsEnded: true, emailVerified: true });
    expect(JSON.stringify(audit)).not.toContain(STRONG);
    expect(JSON.stringify(audit)).not.toContain(hash);
    expect(tx.user.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.auditLog.create.mock.invocationCallOrder[0]
    );
  });

  it("confirms the address when it was not: the link proved it", async () => {
    const row = user({ emailVerified: null });
    const token = await issue("reset");

    await resetPassword(token, STRONG);

    expect(row.emailVerified).toEqual(NOW);
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: "u1", emailVerified: null },
      data: { emailVerified: NOW },
    });
  });

  it("keeps the date of an address confirmed earlier", async () => {
    const earlier = new Date("2026-11-02T08:00:00Z");
    const row = user({ emailVerified: earlier });
    const token = await issue("reset");

    await resetPassword(token, STRONG);

    expect(row.emailVerified).toEqual(earlier);
    expect(JSON.parse(tx.auditLog.create.mock.calls[0][0].data.after)).toEqual({
      sessionsEnded: true,
      emailVerified: false,
    });
  });

  it("deletes the account's other reset links, inside the transaction, and no one else's", async () => {
    user();
    user({ id: "u2", email: "bob@example.com" });
    const token = await issue("reset");
    const expires = new Date(NOW.getTime() + HOUR);
    store.tokens.push(
      { identifier: "reset:u1", token: "f".repeat(64), expires },
      { identifier: "verify:u1", token: "e".repeat(64), expires },
      { identifier: "reset:u2", token: "d".repeat(64), expires }
    );

    await resetPassword(token, STRONG);

    expect(tx.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: "reset:u1" },
    });
    expect(store.tokens.map((t) => t.identifier).sort()).toEqual(["reset:u2", "verify:u1"]);
  });

  it("uses the link up: a second reset with it is invalid", async () => {
    const row = user();
    const token = await issue("reset");

    expect(await resetPassword(token, STRONG)).toEqual({ ok: true });
    const firstHash = row.passwordHash;
    expect(await resetPassword(token, "An0ther!password")).toEqual({
      ok: false,
      error: { key: "errors.emailLinkInvalid" },
    });
    expect(row.passwordHash).toBe(firstHash);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("answers emailLinkExpired after one hour and changes nothing", async () => {
    const row = user();
    const token = await issue("reset");
    at(HOUR);

    expect(await resetPassword(token, STRONG)).toEqual({
      ok: false,
      error: { key: "errors.emailLinkExpired" },
    });
    expect(row.passwordHash).toBe("$2b$10$existing-hash");
    expect(row.sessionsValidAfter).toBeNull();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(store.tokens).toEqual([]);
  });

  it.each([
    { label: "a token nobody issued", make: async () => Buffer.alloc(32, 7).toString("base64url") },
    { label: "a confirmation link", make: () => issue("verify") },
    { label: "garbage", make: async () => "not-a-token" },
  ])("answers emailLinkInvalid for $label and changes nothing", async ({ make }) => {
    const row = user();
    const token = await make();

    expect(await resetPassword(token, STRONG)).toEqual({
      ok: false,
      error: { key: "errors.emailLinkInvalid" },
    });
    expect(row.passwordHash).toBe("$2b$10$existing-hash");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("answers emailLinkInvalid, and keeps nothing, when the account was deleted", async () => {
    const token = await issue("reset", "deleted");

    expect(await resetPassword(token, STRONG)).toEqual({
      ok: false,
      error: { key: "errors.emailLinkInvalid" },
    });
    // The callback threw, which is what makes Prisma roll the transaction back.
    await expect(db.$transaction.mock.results[0].value).rejects.toThrow();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("lets a failed audit write escape the transaction, so the password change is not kept", async () => {
    user();
    const token = await issue("reset");
    tx.auditLog.create.mockRejectedValueOnce(new Error("connection lost"));

    await expect(resetPassword(token, STRONG)).rejects.toThrow("connection lost");
  });

  it("leaves the person signed out", async () => {
    user();
    const token = await issue("reset");
    await resetPassword(token, STRONG);
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe("sendVerificationForNewUser", () => {
  const fresh = (over: Partial<UserRow> = {}) =>
    user({ createdAt: new Date(NOW.getTime() - 5_000), locale: "zh", ...over });
  const arg = { id: "u1", email: "ana@example.com", locale: "zh" };

  it("does nothing, and reads nothing, while no sender is configured", async () => {
    fresh();
    emailSenderConfigured.mockReturnValue(false);

    await expect(sendVerificationForNewUser(arg)).resolves.toBeUndefined();

    expect(store.log).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emails a confirmation link to the new account, in its language", async () => {
    fresh();

    await sendVerificationForNewUser(arg);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [message] = sent();
    expect(message.to).toBe("ana@example.com");
    expect(message.subject).toBe(zhApp.emails.verifySubject);
    expect(linkIn(message)).toContain(`${SITE}/zh/verifier?token=`);
    expect(store.tokens).toEqual([
      {
        identifier: "verify:u1",
        token: hashEmailToken(tokenIn(message)),
        expires: new Date(NOW.getTime() + 24 * HOUR),
      },
    ]);
    expect(await verifyEmail(tokenIn(message))).toEqual({ ok: true });
  });

  it("trusts the stored row over its argument: it is reachable like any server action", async () => {
    fresh();

    // Someone else's address with a real account id: nothing leaves.
    await sendVerificationForNewUser({ ...arg, email: "attacker@evil.test" });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(store.tokens).toEqual([]);

    // The right address: the stored language wins over the one passed in.
    await sendVerificationForNewUser({ ...arg, email: " Ana@Example.com ", locale: "es" });
    expect(sent().map((m) => m.to)).toEqual(["ana@example.com"]);
    expect(sent()[0].subject).toBe(zhApp.emails.verifySubject);
  });

  it.each([
    { label: "an unknown id", seed: () => fresh({ id: "someone-else" }) },
    { label: "a confirmed address", seed: () => fresh({ emailVerified: NOW }) },
    { label: "an account with no password", seed: () => fresh({ passwordHash: null }) },
    {
      label: "an account older than ten minutes",
      seed: () => fresh({ createdAt: new Date(NOW.getTime() - 10 * MINUTE - 1) }),
    },
  ])("sends nothing for $label", async ({ seed }) => {
    seed();
    await sendVerificationForNewUser(arg);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(store.tokens).toEqual([]);
  });

  it.each([
    { label: "null", value: null },
    { label: "a string", value: "u1" },
    { label: "an id that is not a string", value: { id: { $gt: "" }, email: "ana@example.com", locale: "zh" } },
    { label: "an email that is not a string", value: { id: "u1", email: ["ana@example.com"], locale: "zh" } },
  ])("sends nothing for an argument that is $label", async ({ value }) => {
    fresh();
    await expect(sendVerificationForNewUser(value as never)).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("counts against the same limits as requestEmailVerification", async () => {
    fresh();
    state.session = { user: { id: "u1" } };

    await sendVerificationForNewUser(arg);
    await sendVerificationForNewUser(arg);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(await requestEmailVerification()).toEqual({
      ok: false,
      error: { key: "errors.tooManyAttempts" },
    });

    at(MINUTE);
    expect(await requestEmailVerification()).toEqual({ ok: true, alreadyVerified: false });
  });

  it.each([
    {
      label: "the mailer answers not ok",
      arrange: () => sendEmail.mockResolvedValueOnce({ ok: false }),
    },
    {
      label: "the mailer throws",
      arrange: () => sendEmail.mockRejectedValueOnce(new Error("boom for ana@example.com")),
    },
    {
      label: "the database throws",
      arrange: () => db.user.findUnique.mockRejectedValueOnce(new Error("connection lost")),
    },
    {
      label: "the sender check throws",
      arrange: () =>
        emailSenderConfigured.mockImplementationOnce(() => {
          throw new Error("unreadable environment");
        }),
    },
  ])("swallows the failure when $label, and logs no address", async ({ arrange }) => {
    fresh();
    arrange();

    await expect(sendVerificationForNewUser(arg)).resolves.toBeUndefined();

    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(errorLines()).toContain("[account-email]");
    expect(errorLines()).not.toMatch(/ana|example\.com/);
  });
});

describe("signupAction", () => {
  function form(): FormData {
    const data = new FormData();
    data.set("email", "New.Person@Example.com");
    data.set("password", STRONG);
    data.set("kind", "TALENT");
    data.set("locale", "es");
    return data;
  }

  it("round 10: sends the 6-digit code right after creating the account, then signs in on the code screen", async () => {
    sendEmailCode.mockResolvedValueOnce({ ok: true, email: "new.person@example.com" });
    expect(await signupAction(undefined, form())).toBeUndefined();

    expect(db.user.create).toHaveBeenCalledTimes(1);
    expect(sendEmailCode).toHaveBeenCalledWith({ userId: "new-1" });
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn.mock.calls[0][1]).toMatchObject({ redirectTo: "/es/verifier" });
    expect(sendEmailCode.mock.invocationCallOrder[0]).toBeLessThan(signIn.mock.invocationCallOrder[0]);
  });

  it("skips the code screen, and signs in as before, when no code could be sent", async () => {
    sendEmailCode.mockResolvedValueOnce({ ok: false, reason: "unavailable" });

    expect(await signupAction(undefined, form())).toBeUndefined();

    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn.mock.calls[0][1]).toMatchObject({ redirectTo: "/es/talents/inscription" });
  });

  it.each([
    { label: "answers not ok", arrange: () => sendEmailCode.mockResolvedValueOnce({ ok: false, reason: "send_failed" }) },
    { label: "throws", arrange: () => sendEmailCode.mockRejectedValueOnce(new Error("boom")) },
  ])("still creates the account and signs in when the mailer $label", async ({ arrange }) => {
    arrange();

    expect(await signupAction(undefined, form())).toBeUndefined();

    expect(store.users.map((u) => u.email)).toEqual(["new.person@example.com"]);
    expect(signIn).toHaveBeenCalledTimes(1);
  });
});
