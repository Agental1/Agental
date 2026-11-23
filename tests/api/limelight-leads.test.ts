import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lead capture against a real Postgres, on purpose.
 *
 * What matters here is what a mocked Prisma cannot show: that the lead and
 * its alert row commit or roll back together, that the unique index on the
 * email makes a repeat a no-op, and that the conditional write of the outbox
 * claim lets only one of two drains send. The session and the mailer are
 * faked; no email leaves and no DNS is asked.
 *
 * Needs DATABASE_URL pointing at a test database (never production) with the
 * migrations applied; run with DATABASE_POOL_MAX=1 against the local
 * single-connection server. Skipped without it. Every row carries this run's
 * tag and is removed in afterAll.
 *
 * A drain handles every alert that is due, whoever wrote it. So this file
 * refuses to start when the database holds a pending alert that is not a
 * test's: draining it here would mark a real alert as sent.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = "test-ll-leads-";
const RUN = `${TAG}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const FAR_AHEAD = new Date("2999-01-01T00:00:00Z");
const mail = (name: string) => `${RUN}-${name}@test.local`;

const session: { user: { id: string; kind: string } | null } = { user: null };
const mailer = {
  configured: true,
  outcome: { ok: true, mode: "resend" } as { ok: true; mode: "resend" | "log" } | { ok: false },
  sent: [] as { to: string; subject: string; text: string; html: string }[],
};
const afterTasks: Array<() => Promise<void>> = [];

vi.mock("@/auth", () => ({ auth: async () => (session.user ? { user: session.user } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "198.51.100.77" }) }));
// `after` hands the drain to the platform. Here the tasks are collected, so
// a test decides when (and whether) the drain runs.
vi.mock("next/server", () => ({
  after: (task: () => Promise<void>) => {
    afterTasks.push(task);
  },
}));
vi.mock("@/lib/mailer", () => ({
  emailSenderConfigured: () => mailer.configured,
  sendEmail: async (message: { to: string; subject: string; text: string; html: string }) => {
    mailer.sent.push(message);
    return mailer.outcome;
  },
}));

describe.skipIf(!hasDb)("Limelight leads, end to end", () => {
  type Db = typeof import("@/lib/db");
  type Leads = typeof import("@/lib/limelight/leads");
  type Outbox = typeof import("@/lib/limelight/outbox");
  let prisma: Db["prisma"];
  let leads: Leads;
  let outbox: Outbox;
  let interest: typeof import("@/app/api/limelight/interest/route");
  let csvRoute: typeof import("@/app/api/admin/limelight/leads.csv/route");
  let actions: typeof import("@/app/actions/limelight");
  let keyHash: typeof import("@/lib/limelight/request")["limelightKeyHash"];

  let adminId = "";
  let talentId = "";
  let addressCount = 0;
  const addresses: string[] = ["198.51.100.77"];

  /** A client address no other test used, so rate limits never cross tests. */
  function freshAddress(): string {
    const address = `203.0.113.${++addressCount}-${RUN}`;
    addresses.push(address);
    return address;
  }

  function post(body: unknown, address = freshAddress()) {
    return interest.POST(
      new Request("https://app.test/api/limelight/interest", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": address },
        body: JSON.stringify(body),
      })
    );
  }

  const request = (name: string, over: Record<string, unknown> = {}) => ({
    name: "Ana Lee",
    email: mail(name),
    consentVersion: "request-2026-11",
    source: "limelight-page",
    ...over,
  });

  const leadOf = (name: string) => prisma.limelightLead.findUnique({ where: { email: mail(name) } });
  const alertOf = (leadId: string) =>
    prisma.outboxMessage.findUnique({ where: { dedupeKey: outbox.leadAlertDedupeKey(leadId) } });

  /** One drain over everything that is due at `now`. */
  async function drain(now: Date) {
    return outbox.drainOutbox({ now, limit: 100 });
  }

  /** Lead rows of this file (any run) with the keys of their alert rows. */
  async function taggedAlertKeys(prefix: string): Promise<string[]> {
    const rows = await prisma.limelightLead.findMany({
      where: { email: { startsWith: prefix } },
      select: { id: true },
    });
    return rows.map((lead) => outbox.leadAlertDedupeKey(lead.id));
  }

  beforeAll(async () => {
    vi.stubEnv("AUTH_SECRET", "test-secret-with-enough-entropy");
    vi.stubEnv("LIMELIGHT_ALERT_EMAIL", "owner@agental.test");
    ({ prisma } = await import("@/lib/db"));
    leads = await import("@/lib/limelight/leads");
    outbox = await import("@/lib/limelight/outbox");
    interest = await import("@/app/api/limelight/interest/route");
    csvRoute = await import("@/app/api/admin/limelight/leads.csv/route");
    actions = await import("@/app/actions/limelight");
    ({ limelightKeyHash: keyHash } = await import("@/lib/limelight/request"));

    // What an interrupted earlier run of this file left behind.
    await prisma.outboxMessage.deleteMany({ where: { dedupeKey: { in: await taggedAlertKeys(TAG) } } });
    await prisma.limelightLead.deleteMany({ where: { email: { startsWith: TAG } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });

    const foreign = await prisma.outboxMessage.count({
      where: { kind: outbox.LEAD_ALERT_KIND, status: "PENDING" },
    });
    if (foreign > 0) {
      throw new Error(
        `This database holds ${foreign} pending lead alert(s) that no test wrote. ` +
          "Run this file against a test database only."
      );
    }

    const admin = await prisma.user.create({
      data: { email: mail("admin"), kind: "CASTING", isAdmin: true },
    });
    const talent = await prisma.user.create({ data: { email: mail("talent"), kind: "TALENT" } });
    adminId = admin.id;
    talentId = talent.id;
  });

  beforeEach(async () => {
    session.user = null;
    mailer.configured = true;
    mailer.outcome = { ok: true, mode: "resend" };
    mailer.sent.length = 0;
    afterTasks.length = 0;
    // Alerts that earlier tests of this run left pending are moved out of
    // reach, so each test's drains see its own rows only.
    await prisma.outboxMessage.updateMany({
      where: { dedupeKey: { in: await taggedAlertKeys(RUN) }, status: "PENDING" },
      data: { nextAttemptAt: FAR_AHEAD },
    });
  });

  afterAll(async () => {
    await prisma.outboxMessage.deleteMany({ where: { dedupeKey: { in: await taggedAlertKeys(RUN) } } });
    await prisma.limelightLead.deleteMany({ where: { email: { startsWith: RUN } } });
    await prisma.rateLimitEvent.deleteMany({
      where: {
        key: {
          in: [
            ...addresses.map((address) => `limelight:interest:addr:${keyHash("addr", address)}`),
            ...usedEmails.map((email) => `limelight:interest:email:${keyHash("email", email)}`),
          ],
        },
      },
    });
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: [adminId, talentId] } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: RUN } } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  // Every email a test sends, for the rate limit cleanup above.
  const usedEmails: string[] = [];
  const track = (name: string) => {
    usedEmails.push(mail(name));
    return name;
  };

  describe("POST /api/limelight/interest", () => {
    it("201: the lead and its alert row exist by the time the answer arrives", async () => {
      const res = await post(
        request(track("first"), { performerType: "actor", portfolioUrl: "https://ana.example.org/reel", locale: "fr" })
      );
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body).toEqual({ ok: true, reference: expect.stringMatching(/^LL-[0-9A-HJKMNP-TV-Z]{8}$/) });

      const lead = await leadOf("first");
      expect(lead).toMatchObject({
        reference: body.reference,
        name: "Ana Lee",
        performerType: "actor",
        portfolioUrl: "https://ana.example.org/reel",
        source: "limelight-page",
        consentVersion: "request-2026-11",
        marketingOptIn: false,
        locale: "fr",
        status: "NEW",
        submissions: 1,
      });
      const alert = await alertOf(lead!.id);
      expect(alert).toMatchObject({ kind: "limelight.lead.alert", status: "PENDING", attempts: 0 });
      // Record references only.
      expect(JSON.parse(alert!.payload)).toEqual({ leadId: lead!.id, reference: body.reference });
    });

    it("201: schedules exactly one drain, after the lead is stored, and the answer does not wait for it", async () => {
      const res = await post(request(track("drained")));
      expect(res.status).toBe(201);

      // The response exists and nothing was sent yet: the drain is a task
      // for after the response.
      expect(mailer.sent).toHaveLength(0);
      expect(afterTasks).toHaveLength(1);
      const lead = await leadOf("drained");
      expect((await alertOf(lead!.id))?.status).toBe("PENDING");

      await afterTasks[0]();

      // Round 9: the team alert, then the confirmation to the person.
      // (Earlier tests' leads may get their confirmation in the same drain.)
      const alerts = mailer.sent.filter((m) => m.to === "owner@agental.test");
      expect(alerts).toHaveLength(1);
      expect(mailer.sent.filter((m) => m.to === lead!.email)).toEqual([expect.objectContaining({ kind: "limelight_confirmation" })]);
      expect((await alertOf(lead!.id))?.status).toBe("SENT");
      expect((await prisma.limelightLead.findUnique({ where: { id: lead!.id } }))?.confirmation).toBe("sent");
    });

    it("201: a failing drain after the response changes nothing for the person", async () => {
      mailer.outcome = { ok: false };
      const res = await post(request(track("drain-fails")));

      expect(res.status).toBe(201);
      await afterTasks[0]();

      const lead = await leadOf("drain-fails");
      expect(lead).not.toBeNull();
      expect(await alertOf(lead!.id)).toMatchObject({ status: "PENDING", attempts: 1 });
    });

    it("the alert email carries the reference and the owner view path, and nothing about the person", async () => {
      const res = await post(
        request(track("private"), { name: "Zelda Quartermain", portfolioUrl: "https://zelda.example.org/me" })
      );
      const { reference } = await res.json();
      await afterTasks[0]();

      const sent = mailer.sent.find((message) => message.subject.includes(reference));
      expect(sent).toBeDefined();
      const everything = `${sent!.subject}\n${sent!.text}\n${sent!.html}`;
      expect(everything).toContain(reference);
      expect(everything).toContain("/admin/limelight");
      expect(everything).not.toMatch(/Zelda|Quartermain|zelda\.example|test\.local/);
      expect(everything).not.toContain(mail("private"));
    });

    it("400: real validation, one key per field, and nothing stored", async () => {
      const res = await post({
        name: " ",
        email: `${RUN}-not-an-email`,
        portfolioUrl: "javascript:alert(1)",
        contactPref: "call",
        source: "limelight-page",
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        ok: false,
        fieldErrors: {
          name: "errors.nameRequired",
          email: "errors.emailInvalid",
          portfolioUrl: "errors.urlInvalid",
          consentVersion: "errors.consentRequired",
          phone: "errors.phoneRequired",
        },
      });
      expect(await prisma.limelightLead.count({ where: { email: { startsWith: `${RUN}-not` } } })).toBe(0);
      expect(afterTasks).toHaveLength(0);
    });

    it("201 for a filled honeypot, with a reference that names nothing, and no row at all", async () => {
      const address = freshAddress();
      const res = await post(request("honeypot", { company: "Acme Inc." }), address);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.reference).toMatch(/^LL-[0-9A-HJKMNP-TV-Z]{8}$/);
      expect(await leadOf("honeypot")).toBeNull();
      expect(await prisma.limelightLead.findUnique({ where: { reference: body.reference } })).toBeNull();
      expect(
        await prisma.rateLimitEvent.count({ where: { key: `limelight:interest:addr:${keyHash("addr", address)}` } })
      ).toBe(0);
      expect(afterTasks).toHaveLength(0);
    });

    it("429 once one client address has sent five requests in ten minutes", async () => {
      const address = freshAddress();
      for (let i = 0; i < 5; i++) {
        expect((await post(request(track(`flood-${i}`)), address)).status).toBe(201);
      }

      const res = await post(request("flood-6"), address);

      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ ok: false, error: "errors.limelightTooMany" });
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(await leadOf("flood-6")).toBeNull();
      // The address is stored as a keyed hash, never as itself.
      expect(await prisma.rateLimitEvent.count({ where: { key: { contains: address } } })).toBe(0);
    });
  });

  describe("one transaction for the lead and its alert", () => {
    it("stores neither when the alert row cannot be written", async () => {
      const name = track("atomic");
      // The real client, with one change: inside the transaction the outbox
      // insert fails after the lead insert went through.
      const failing = {
        rateLimitEvent: prisma.rateLimitEvent,
        limelightLead: prisma.limelightLead,
        outboxMessage: prisma.outboxMessage,
        $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
          prisma.$transaction(async (tx) => {
            const broken = new Proxy(tx, {
              get(target, property, receiver) {
                if (property === "outboxMessage") {
                  return {
                    create: async () => {
                      // The lead of this very transaction is visible here...
                      expect(await tx.limelightLead.count({ where: { email: mail(name) } })).toBe(1);
                      throw new Error("outbox table unavailable");
                    },
                  };
                }
                return Reflect.get(target, property, receiver);
              },
            });
            return fn(broken);
          }),
      };
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await leads.recordInterest(request(name), { db: failing as never });

      error.mockRestore();
      expect(result).toEqual({ ok: false, reason: "failed" });
      // ...and gone once the transaction rolled back.
      expect(await leadOf(name)).toBeNull();
    });
  });

  describe("a repeat of the same email", () => {
    it("creates nothing new: same reference, one lead, one alert, a counter", async () => {
      const name = track("repeat");
      const first = await (await post(request(name))).json();
      const before = await leadOf(name);

      const res = await post(
        request(name, {
          email: `  ${mail(name).toUpperCase()} `,
          name: "Someone Else",
          performerType: "dancer",
          portfolioUrl: "https://ana.example.org",
          marketingOptIn: true,
        })
      );

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ ok: true, reference: first.reference });
      expect(await prisma.limelightLead.count({ where: { email: mail(name) } })).toBe(1);

      const after = await leadOf(name);
      expect(after).toMatchObject({
        id: before!.id,
        reference: first.reference,
        submissions: 2,
        name: "Ana Lee",
        // Empty before, so filled; and the opt-in was an explicit true.
        performerType: "dancer",
        portfolioUrl: "https://ana.example.org",
        marketingOptIn: true,
      });
      expect(after!.firstSeenAt.getTime()).toBe(before!.firstSeenAt.getTime());
      expect(after!.lastSeenAt.getTime()).toBeGreaterThanOrEqual(before!.lastSeenAt.getTime());
      expect(
        await prisma.outboxMessage.count({ where: { dedupeKey: outbox.leadAlertDedupeKey(after!.id) } })
      ).toBe(1);
    });

    it("sends no second alert, even after the first one went out", async () => {
      const name = track("one-alert");
      await post(request(name));
      await afterTasks[0]();
      const lead = await leadOf(name);
      expect((await alertOf(lead!.id))?.status).toBe("SENT");
      const sentBefore = mailer.sent.length;

      await post(request(name));

      // A repeat schedules no drain and leaves the alert row as it was.
      expect(afterTasks).toHaveLength(1);
      await drain(new Date(Date.now() + 60 * 60 * 1000));
      expect(mailer.sent).toHaveLength(sentBefore);
      expect(await alertOf(lead!.id)).toMatchObject({ status: "SENT", attempts: 1 });
    });

    it("keeps a filled field and never turns the opt-in off", async () => {
      const name = track("keep");
      await post(request(name, { performerType: "actor", marketingOptIn: true }));

      await post(request(name, { performerType: "dancer", marketingOptIn: false }));

      expect(await leadOf(name)).toMatchObject({ performerType: "actor", marketingOptIn: true, submissions: 2 });
    });

    it("two requests for one new email at the same moment make one lead and one alert", async () => {
      const name = track("race");

      const [a, b] = await Promise.all([post(request(name)), post(request(name))]);

      expect([a.status, b.status]).toEqual([201, 201]);
      expect((await a.json()).reference).toBe((await b.json()).reference);
      const lead = await leadOf(name);
      expect(lead?.submissions).toBe(2);
      expect(await prisma.limelightLead.count({ where: { email: mail(name) } })).toBe(1);
      expect(
        await prisma.outboxMessage.count({ where: { dedupeKey: outbox.leadAlertDedupeKey(lead!.id) } })
      ).toBe(1);
    });
  });

  describe("the alert: delivery, failure and retry", () => {
    async function freshLead(name: string) {
      const res = await post(request(track(name)));
      expect(res.status).toBe(201);
      afterTasks.length = 0;
      return (await leadOf(name))!;
    }

    const listed = async (leadId: string) =>
      (await leads.listLimelightLeads({ limit: 5000 })).find((lead) => lead.id === leadId);

    it("a mail failure leaves the lead listed, and a later drain delivers the alert", async () => {
      const lead = await freshLead("mail-down");
      const t0 = new Date();
      mailer.outcome = { ok: false };

      expect(await drain(t0)).toMatchObject({ configured: true, retried: 1, sent: 0 });

      // The lead is there for the owner whatever happened to the email.
      expect(await listed(lead.id)).toMatchObject({ email: lead.email, status: "NEW", alert: "PENDING" });
      const failed = await alertOf(lead.id);
      expect(failed).toMatchObject({ status: "PENDING", attempts: 1, sentAt: null });
      expect(failed!.lastError).toBeTruthy();
      expect(failed!.nextAttemptAt.getTime()).toBe(t0.getTime() + 5 * 60 * 1000);

      // Not before its wait is over.
      mailer.outcome = { ok: true, mode: "resend" };
      mailer.sent.length = 0;
      await drain(new Date(t0.getTime() + 60 * 1000));
      expect(mailer.sent).toHaveLength(0);

      // Then it goes out.
      const t1 = new Date(t0.getTime() + 6 * 60 * 1000);
      expect(await drain(t1)).toMatchObject({ sent: 1 });
      expect(mailer.sent).toHaveLength(1);
      expect(await alertOf(lead.id)).toMatchObject({ status: "SENT", attempts: 2, lastError: null });
      expect((await listed(lead.id))?.alert).toBe("SENT");
    });

    it("gives up at maxAttempts, and the lead is still listed, marked DEAD", async () => {
      const lead = await freshLead("mail-dead");
      await prisma.outboxMessage.update({
        where: { dedupeKey: outbox.leadAlertDedupeKey(lead.id) },
        data: { maxAttempts: 2 },
      });
      mailer.outcome = { ok: false };
      const t0 = new Date();

      await drain(t0);
      expect(await drain(new Date(t0.getTime() + 5 * 60 * 1000))).toMatchObject({ dead: 1 });

      expect(await alertOf(lead.id)).toMatchObject({ status: "DEAD", attempts: 2, sentAt: null });
      expect(await listed(lead.id)).toMatchObject({ alert: "DEAD", status: "NEW" });

      mailer.outcome = { ok: true, mode: "resend" };
      mailer.sent.length = 0;
      await drain(new Date(t0.getTime() + 24 * 60 * 60 * 1000));
      expect(mailer.sent).toHaveLength(0);
    });

    it("with no sender configured the row stays PENDING and no attempt is used", async () => {
      const lead = await freshLead("no-key");
      const before = await alertOf(lead.id);
      mailer.configured = false;
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      for (let i = 0; i < 3; i++) {
        expect(await drain(new Date(Date.now() + i * 60 * 60 * 1000))).toMatchObject({
          configured: false,
          sent: 0,
          retried: 0,
          dead: 0,
        });
      }
      warn.mockRestore();

      expect(mailer.sent).toHaveLength(0);
      expect(await alertOf(lead.id)).toEqual(before);

      // The key arrives: the same row is sent, on its first attempt.
      mailer.configured = true;
      await drain(new Date());
      expect(await alertOf(lead.id)).toMatchObject({ status: "SENT", attempts: 1 });
    });

    it("with no alert address the row stays PENDING and no attempt is used", async () => {
      const lead = await freshLead("no-address");
      vi.stubEnv("LIMELIGHT_ALERT_EMAIL", "");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(await drain(new Date())).toMatchObject({ configured: false });

      warn.mockRestore();
      vi.stubEnv("LIMELIGHT_ALERT_EMAIL", "owner@agental.test");
      expect(mailer.sent).toHaveLength(0);
      expect(await alertOf(lead.id)).toMatchObject({ status: "PENDING", attempts: 0 });
      await drain(new Date());
    });

    // Two real drains need two connections. The local `prisma dev` database
    // answers one query at a time (DATABASE_POOL_MAX=1): concurrent queries on
    // it fail at random ("bind message supplies N parameters"), so the case
    // only runs against a database with a real pool. The claim race itself is
    // covered on every run by "two drains at the same moment" in
    // tests/lib/limelight-outbox.test.ts (round 8c).
    it.skipIf(Number(process.env.DATABASE_POOL_MAX) === 1)("two drains at the same moment send one alert once", async () => {
      const lead = await freshLead("two-drains");
      const now = new Date();

      const [a, b] = await Promise.all([drain(now), drain(now)]);

      const mine = mailer.sent.filter((message) => message.subject.includes(lead.reference));
      expect(mine).toHaveLength(1);
      expect(a.sent + b.sent).toBe(1);
      expect(await alertOf(lead.id)).toMatchObject({ status: "SENT", attempts: 1 });
    });
  });

  describe("the owner view", () => {
    const csv = () => csvRoute.GET(new Request("https://app.test/api/admin/limelight/leads.csv"));

    it("the CSV export is a 404 for a visitor and for a signed-in talent", async () => {
      expect((await csv()).status).toBe(404);

      session.user = { id: talentId, kind: "TALENT" };
      const res = await csv();
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Not found");
      expect(await prisma.auditLog.count({ where: { actorUserId: talentId } })).toBe(0);
    });

    it("an admin gets every lead, neutralized, and the export is audited with its row count", async () => {
      const name = track("csv");
      await post(request(name, { name: '=HYPERLINK("https://evil.example","Ana, Lee")' }));
      session.user = { id: adminId, kind: "CASTING" };

      const res = await csv();
      const text = await res.text();

      expect(res.status).toBe(200);
      expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="limelight-leads-/);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const lines = text.split("\r\n");
      expect(lines[0]).toMatch(/^reference,name,email,/);
      const row = lines.find((line) => line.includes(mail(name)));
      expect(row).toContain(`"'=HYPERLINK(""https://evil.example"",""Ana, Lee"")"`);

      const rows = await prisma.limelightLead.count();
      const audit = await prisma.auditLog.findFirst({
        where: { actorUserId: adminId, action: "limelight.leads.export" },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).toMatchObject({ resourceType: "LimelightLead", resourceId: "csv" });
      expect(JSON.parse(audit!.after)).toEqual({ rows, status: null });
      expect(lines.length - 2).toBe(rows);
    });

    it("only an admin moves a lead to another status, and the change is audited", async () => {
      const name = track("status");
      await post(request(name));
      const lead = (await leadOf(name))!;

      session.user = null;
      expect(await actions.setLeadStatus(lead.id, "CONTACTED")).toEqual({
        ok: false,
        error: { key: "errors.unauthorized" },
      });
      session.user = { id: talentId, kind: "TALENT" };
      expect(await actions.setLeadStatus(lead.id, "CONTACTED")).toEqual({
        ok: false,
        error: { key: "errors.forbidden" },
      });
      expect((await leadOf(name))?.status).toBe("NEW");

      session.user = { id: adminId, kind: "CASTING" };
      expect(await actions.setLeadStatus(lead.id, "CONTACTED")).toEqual({ ok: true, status: "CONTACTED" });

      expect((await leadOf(name))?.status).toBe("CONTACTED");
      const audit = await prisma.auditLog.findFirst({
        where: { action: "limelight.lead.status", resourceId: lead.id },
      });
      expect(audit).toMatchObject({ actorUserId: adminId, resourceType: "LimelightLead" });
      expect(JSON.parse(audit!.before)).toEqual({ status: "NEW" });
      expect(JSON.parse(audit!.after)).toEqual({ status: "CONTACTED" });

      expect((await leads.listLimelightLeads({ status: "CONTACTED", limit: 5000 })).map((l) => l.id)).toContain(lead.id);
      expect((await leads.listLimelightLeads({ status: "NEW", limit: 5000 })).map((l) => l.id)).not.toContain(lead.id);
    });

    it("lists newest first", async () => {
      await post(request(track("older")));
      await new Promise((resolve) => setTimeout(resolve, 15));
      await post(request(track("newer")));

      const emails = (await leads.listLimelightLeads({ limit: 5000 })).map((lead) => lead.email);
      expect(emails.indexOf(mail("newer"))).toBeLessThan(emails.indexOf(mail("older")));
      expect(emails.indexOf(mail("newer"))).toBeGreaterThanOrEqual(0);
    });
  });

  describe("the server actions use the same durable core", () => {
    function form(fields: Record<string, string>): FormData {
      const data = new FormData();
      for (const [key, value] of Object.entries(fields)) data.set(key, value);
      return data;
    }

    it("requestPortfolioSite stores the lead and answers its reference", async () => {
      const name = track("action");
      const state = await actions.requestPortfolioSite(
        undefined,
        form({ name: "Ana Lee", email: mail(name), consentVersion: "request-2026-11", marketingOptIn: "on" })
      );

      const lead = await leadOf(name);
      expect(state).toEqual({ ok: true, reference: lead!.reference });
      expect(lead).toMatchObject({ source: "limelight-page", marketingOptIn: true });
      expect(await alertOf(lead!.id)).not.toBeNull();
    });

    it("requestPortfolioSite answers field errors for an unticked consent box", async () => {
      const state = await actions.requestPortfolioSite(
        undefined,
        form({ name: "Ana Lee", email: mail("no-consent") })
      );

      expect(state).toEqual({ ok: false, fieldErrors: { consentVersion: "errors.consentRequired" } });
      expect(await leadOf("no-consent")).toBeNull();
    });

    it("submitLimelightLead, the form on the page today, now stores the lead in Postgres", async () => {
      const name = track("legacy");
      const state = await actions.submitLimelightLead(
        undefined,
        form({
          name: "Ana Lee",
          email: mail(name),
          discipline: "musician",
          need: "new",
          budget: "essential",
          contactPref: "email",
          phone: "",
          message: "",
          locale: "es",
        })
      );

      expect(state).toEqual({ ok: true, email: mail(name) });
      const lead = await leadOf(name);
      expect(lead).toMatchObject({
        performerType: "musician",
        source: "limelight-page",
        consentVersion: "limelight-page-2026-11",
        locale: "es",
      });
      expect(await alertOf(lead!.id)).toMatchObject({ status: "PENDING" });
    });
  });

  describe("need, contact preference and phone", () => {
    const callback = { need: "redo", contactPref: "call", phone: "+1 (310) 555-0142" };

    it("a call request without a phone number is refused and stores nothing", async () => {
      const res = await post(request("no-phone", { contactPref: "call" }));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, fieldErrors: { phone: "errors.phoneRequired" } });
      expect(await leadOf("no-phone")).toBeNull();
    });

    it("the lead is stored whether or not the three columns exist yet", async () => {
      const name = track("details");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await leads.recordInterest(request(name, callback), {});

      warn.mockRestore();
      expect(result).toMatchObject({ ok: true, created: true, stored: true, detailsStored: leads.LEAD_DETAIL_COLUMNS });
      expect(await leadOf(name)).not.toBeNull();
    });

    // Skips itself until LEAD_DETAIL_COLUMNS is true, which needs the three
    // columns in the database and in the generated client.
    it(
      "with the columns in place: stores all three, and no phone without a call request",
      async (ctx) => {
        if (!leads.LEAD_DETAIL_COLUMNS) return ctx.skip();
        const withCall = track("details-call");
        const withoutCall = track("details-email");

        await leads.recordInterest(request(withCall, callback), {});
        await leads.recordInterest(
          request(withoutCall, { need: "new", contactPref: "email", phone: "+1 (310) 555-0142" }),
          {}
        );

        const listed = await leads.listLimelightLeads({ limit: 5000 });
        expect(listed.find((lead) => lead.email === mail(withCall))).toMatchObject({
          need: "redo",
          contactPref: "call",
          phone: "+1 (310) 555-0142",
        });
        expect(listed.find((lead) => lead.email === mail(withoutCall))).toMatchObject({
          need: "new",
          contactPref: "email",
          phone: null,
        });
      }
    );
  });
});
