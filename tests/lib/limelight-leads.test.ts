import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `recordInterest` against an in-memory stand-in for the three tables it
 * touches. The stand-in keeps the two unique indexes (email, reference) and
 * rolls a transaction back when its callback throws, which is what the
 * dedupe and the "lead and alert together" rule rest on. That Postgres
 * really behaves this way is checked in tests/api/limelight-leads.test.ts.
 */

vi.mock("@/lib/db", () => ({ prisma: {} }));

const {
  INTEREST_PER_ADDRESS,
  INTEREST_PER_EMAIL,
  LEAD_DETAIL_COLUMNS,
  changeLeadStatus,
  listLimelightLeads,
  newLeadReference,
  recordInterest,
} = await import("@/lib/limelight/leads");
const { LEAD_ALERT_KIND, leadAlertDedupeKey } = await import("@/lib/limelight/outbox");
const { LIMELIGHT_REFERENCE_PATTERN } = await import("@/domain/limelight");

type Row = Record<string, unknown>;

function unique(): Error {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

function fakeDb() {
  const state = {
    leads: [] as Row[],
    outbox: [] as Row[],
    events: [] as { key: string; createdAt: Date }[],
    audits: [] as Row[],
  };
  let ids = 0;
  const failures: Error[] = [];

  const tables = (s: typeof state) => ({
    limelightLead: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
        const row = s.leads.find((l) => (where.email ? l.email === where.email : l.id === where.id));
        return row ? { ...row } : null;
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const failure = failures.shift();
        if (failure) throw failure;
        if (s.leads.some((l) => l.email === data.email || l.reference === data.reference)) throw unique();
        const row = { id: `lead${++ids}`, ...data };
        s.leads.push(row);
        return { ...row };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = s.leads.find((l) => l.id === where.id)!;
        for (const [key, value] of Object.entries(data)) {
          if (value && typeof value === "object" && "increment" in value) {
            row[key] = (row[key] as number) + (value as { increment: number }).increment;
          } else {
            row[key] = value;
          }
        }
        return { ...row };
      }),
      findMany: vi.fn(async ({ where, take }: { where: { status?: string }; take: number }) =>
        s.leads
          .filter((l) => !where.status || l.status === where.status)
          .sort((a, b) => (b.firstSeenAt as Date).getTime() - (a.firstSeenAt as Date).getTime())
          .slice(0, take)
          .map((l) => ({ ...l }))
      ),
    },
    outboxMessage: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        if (s.outbox.some((m) => m.dedupeKey === data.dedupeKey)) throw unique();
        s.outbox.push({ id: `msg${++ids}`, attempts: 0, ...data });
        return data;
      }),
      findMany: vi.fn(async ({ where }: { where: { dedupeKey: { in: string[] } } }) =>
        s.outbox.filter((m) => where.dedupeKey.in.includes(m.dedupeKey as string)).map((m) => ({ ...m }))
      ),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        s.audits.push(data);
        return data;
      }),
    },
  });

  const live = tables(state);
  const db = {
    ...live,
    rateLimitEvent: {
      findMany: vi.fn(async ({ where, take }: { where: { key: string; createdAt: { gt: Date } }; take: number }) =>
        state.events
          .filter((e) => e.key === where.key && e.createdAt.getTime() > where.createdAt.gt.getTime())
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, take)
      ),
      create: vi.fn(async ({ data }: { data: { key: string; createdAt: Date } }) => {
        state.events.push(data);
        return data;
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    // All or nothing: the callback works on a copy that replaces the tables
    // only when it returns.
    $transaction: vi.fn(async (fn: (tx: ReturnType<typeof tables>) => Promise<unknown>) => {
      const draft = {
        ...state,
        leads: state.leads.map((l) => ({ ...l })),
        outbox: state.outbox.map((m) => ({ ...m })),
        audits: [...state.audits],
      };
      const result = await fn(tables(draft));
      state.leads = draft.leads;
      state.outbox = draft.outbox;
      state.audits = draft.audits;
      return result;
    }),
  };
  return { db, state, failNextCreate: (error: Error) => failures.push(error) };
}

const now = new Date("2026-11-19T10:00:00Z");
const later = new Date("2026-11-19T10:05:00Z");
const request = {
  name: "Ana Lee",
  email: "Ana@Example.com",
  consentVersion: "request-2026-11",
  source: "limelight-page",
};

let logs: { info: ReturnType<typeof vi.spyOn>; warn: ReturnType<typeof vi.spyOn>; error: ReturnType<typeof vi.spyOn> };

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "test-secret-with-enough-entropy");
  logs = {
    info: vi.spyOn(console, "info").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const logged = () =>
  [logs.info, logs.warn, logs.error]
    .flatMap((spy) => spy.mock.calls)
    .map((call) => call.map(String).join(" "))
    .join("\n");

describe("newLeadReference", () => {
  it("is LL- and eight characters a person can read out, different every time", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const reference = newLeadReference();
      expect(reference).toMatch(LIMELIGHT_REFERENCE_PATTERN);
      seen.add(reference);
    }
    expect(seen.size).toBe(500);
  });
});

describe("recordInterest: a new lead", () => {
  it("stores the lead and its alert row in one transaction, and only then answers", async () => {
    const { db, state } = fakeDb();

    const result = await recordInterest(
      { ...request, performerType: "actor", portfolioUrl: "https://ana.example.com", locale: "fr" },
      { db: db as never, now, clientKey: "k1" }
    );

    expect(result).toEqual({
      ok: true,
      reference: expect.stringMatching(LIMELIGHT_REFERENCE_PATTERN),
      created: true,
      stored: true,
      detailsStored: true,
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(state.leads).toEqual([
      {
        id: "lead1",
        reference: (result as { reference: string }).reference,
        email: "ana@example.com",
        name: "Ana Lee",
        performerType: "actor",
        portfolioUrl: "https://ana.example.com",
        source: "limelight-page",
        consentVersion: "request-2026-11",
        marketingOptIn: false,
        locale: "fr",
        status: "NEW",
        submissions: 1,
        firstSeenAt: now,
        lastSeenAt: now,
        // An email request with nothing more to say: no need, no phone.
        need: null,
        contactPref: "email",
        phone: null,
      },
    ]);
    expect(state.outbox).toHaveLength(1);
    expect(state.outbox[0]).toMatchObject({
      kind: LEAD_ALERT_KIND,
      dedupeKey: leadAlertDedupeKey("lead1"),
      status: "PENDING",
      nextAttemptAt: now,
    });
  });

  it("puts record references in the alert payload and nothing about the person", async () => {
    const { db, state } = fakeDb();
    const result = await recordInterest(
      { ...request, portfolioUrl: "https://ana.example.com" },
      { db: db as never, now }
    );

    const payload = JSON.parse(state.outbox[0].payload as string);
    expect(payload).toEqual({ leadId: "lead1", reference: (result as { reference: string }).reference });
    expect(state.outbox[0].payload).not.toMatch(/ana|example/i);
  });

  it("writes neither row when the alert row cannot be written", async () => {
    const { db, state } = fakeDb();
    // Not a unique violation, so it is not retried: the transaction is lost.
    db.$transaction.mockImplementationOnce(async () => {
      throw new Error("connection reset while writing the outbox row");
    });

    expect(await recordInterest(request, { db: db as never, now })).toEqual({ ok: false, reason: "failed" });
    expect(state.leads).toEqual([]);
    expect(state.outbox).toEqual([]);
  });

  it("rolls the lead back when its alert row is refused inside the transaction", async () => {
    const { db, state } = fakeDb();
    // An alert row already sits on the key the first attempt's lead gets.
    state.outbox.push({ id: "old", dedupeKey: leadAlertDedupeKey("lead1"), status: "SENT" });

    const result = await recordInterest(request, { db: db as never, now });

    // The first attempt wrote a lead, then the unique index refused its
    // alert row: the whole attempt was undone, lead included. The second
    // attempt stored a lead together with its own alert.
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: true, created: true });
    expect(state.leads.map((l) => l.id)).toEqual(["lead2"]);
    expect(state.outbox.map((m) => m.dedupeKey)).toEqual([
      leadAlertDedupeKey("lead1"),
      leadAlertDedupeKey("lead2"),
    ]);
  });

  it("logs the lead id, never the name or the address", async () => {
    const { db } = fakeDb();
    await recordInterest(request, { db: db as never, now });

    expect(logged()).toContain("lead1");
    expect(logged()).not.toMatch(/ana|example\.com/i);
  });

  it("answers a failure, and nothing else, when the database is down", async () => {
    const { db, state } = fakeDb();
    db.$transaction.mockRejectedValue(
      Object.assign(new Error("Can't reach database for ana@example.com"), { name: "PrismaClientInitializationError" })
    );

    expect(await recordInterest(request, { db: db as never, now })).toEqual({ ok: false, reason: "failed" });
    expect(state.leads).toEqual([]);
    expect(logged()).toContain("PrismaClientInitializationError");
    expect(logged()).not.toMatch(/ana@example\.com/);
  });

  it("draws another reference when the first one is taken", async () => {
    const { db, state, failNextCreate } = fakeDb();
    failNextCreate(unique());

    const result = await recordInterest(request, { db: db as never, now });

    expect(result).toMatchObject({ ok: true, created: true });
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(state.leads).toHaveLength(1);
    expect(state.outbox).toHaveLength(1);
  });

  it("gives up after four refused writes instead of looping", async () => {
    const { db, failNextCreate } = fakeDb();
    for (let i = 0; i < 6; i++) failNextCreate(unique());

    expect(await recordInterest(request, { db: db as never, now })).toEqual({ ok: false, reason: "failed" });
    expect(db.$transaction).toHaveBeenCalledTimes(4);
  });
});

describe("recordInterest: validation and the honeypot", () => {
  it("answers field errors without touching the database", async () => {
    const { db } = fakeDb();

    expect(await recordInterest({ ...request, email: "nope" }, { db: db as never, now, clientKey: "k1" })).toEqual({
      ok: false,
      reason: "invalid",
      fieldErrors: { email: "errors.emailInvalid" },
    });
    expect(db.$transaction).not.toHaveBeenCalled();
    // Invalid input does not count toward a limit either.
    expect(db.rateLimitEvent.findMany).not.toHaveBeenCalled();
  });

  it.each(["Acme Inc.", "x", 1, true, { a: 1 }])(
    "answers a made-up reference to a filled honeypot (%j) and stores nothing",
    async (company) => {
      const { db, state } = fakeDb();

      const result = await recordInterest({ ...request, company }, { db: db as never, now, clientKey: "k1" });

      expect(result).toEqual({
        ok: true,
        reference: expect.stringMatching(LIMELIGHT_REFERENCE_PATTERN),
        created: false,
        stored: false,
        detailsStored: false,
      });
      expect(state.leads).toEqual([]);
      expect(state.outbox).toEqual([]);
      expect(state.events).toEqual([]);
      expect(db.$transaction).not.toHaveBeenCalled();
    }
  );

  it("answers the honeypot before validating, so a bot learns nothing from a bad field", async () => {
    const { db } = fakeDb();
    expect(await recordInterest({ company: "Acme", email: "nope" }, { db: db as never, now })).toMatchObject({
      ok: true,
      stored: false,
    });
  });

  it.each(["", "   ", null, undefined, false])("reads the honeypot %j as empty", async (company) => {
    const { db, state } = fakeDb();
    expect(await recordInterest({ ...request, company }, { db: db as never, now })).toMatchObject({
      ok: true,
      stored: true,
    });
    expect(state.leads).toHaveLength(1);
  });
});

describe("recordInterest: a repeat of the same email", () => {
  it("answers the same reference, counts the submission, and writes no second alert", async () => {
    const { db, state } = fakeDb();
    const first = await recordInterest(request, { db: db as never, now });

    const second = await recordInterest(
      { ...request, email: " ANA@example.com ", name: "Someone Else", source: "campaign-x", locale: "es" },
      { db: db as never, now: later }
    );

    expect(second).toEqual({
      ok: true,
      reference: (first as { reference: string }).reference,
      created: false,
      stored: true,
      detailsStored: true,
    });
    expect(state.leads).toHaveLength(1);
    expect(state.outbox).toHaveLength(1);
    expect(state.leads[0]).toMatchObject({
      submissions: 2,
      firstSeenAt: now,
      lastSeenAt: later,
      // First recorded, and kept: a stranger who knows the address cannot
      // rename the lead.
      name: "Ana Lee",
      source: "limelight-page",
      locale: "en",
      status: "NEW",
    });
  });

  it("fills optional fields that were empty, and leaves the ones that were set", async () => {
    const { db, state } = fakeDb();
    await recordInterest({ ...request, performerType: "actor" }, { db: db as never, now });

    await recordInterest(
      { ...request, performerType: "dancer", portfolioUrl: "https://ana.example.com" },
      { db: db as never, now: later }
    );

    expect(state.leads[0]).toMatchObject({ performerType: "actor", portfolioUrl: "https://ana.example.com" });
  });

  it("turns the marketing opt-in on only for an explicit true, and never off", async () => {
    const { db, state } = fakeDb();
    await recordInterest(request, { db: db as never, now });
    expect(state.leads[0].marketingOptIn).toBe(false);

    await recordInterest({ ...request }, { db: db as never, now: later });
    expect(state.leads[0].marketingOptIn).toBe(false);

    await recordInterest({ ...request, marketingOptIn: true }, { db: db as never, now: later });
    expect(state.leads[0].marketingOptIn).toBe(true);

    await recordInterest({ ...request, marketingOptIn: false }, { db: db as never, now: later });
    expect(state.leads[0].marketingOptIn).toBe(true);
    expect(state.leads[0].submissions).toBe(4);
  });

  it("finds the row another request wrote at the same moment", async () => {
    const { db, state } = fakeDb();
    // Both requests read "no such email". The other one commits first, and
    // the unique index on the email refuses this one's insert.
    db.$transaction.mockImplementationOnce(async () => {
      state.leads.push({
        id: "other",
        reference: "LL-0THER000",
        email: "ana@example.com",
        name: "Ana Lee",
        performerType: null,
        portfolioUrl: null,
        marketingOptIn: false,
        submissions: 1,
        firstSeenAt: now,
        lastSeenAt: now,
      });
      throw unique();
    });

    expect(await recordInterest(request, { db: db as never, now })).toMatchObject({
      ok: true,
      reference: "LL-0THER000",
      created: false,
    });
    expect(state.leads).toHaveLength(1);
    expect(state.leads[0].submissions).toBe(2);
    expect(state.outbox).toEqual([]);
  });
});

describe("recordInterest: rate limits", () => {
  it("refuses the request past the limit for one client address, with the wait", async () => {
    const { db, state } = fakeDb();
    for (let i = 0; i < INTEREST_PER_ADDRESS.limit; i++) {
      expect(
        await recordInterest({ ...request, email: `p${i}@example.com` }, { db: db as never, now, clientKey: "k1" })
      ).toMatchObject({ ok: true });
    }

    expect(
      await recordInterest({ ...request, email: "one-more@example.com" }, { db: db as never, now: later, clientKey: "k1" })
    ).toEqual({ ok: false, reason: "rate_limited", retryAfterMs: 5 * 60 * 1000 });
    expect(state.leads).toHaveLength(INTEREST_PER_ADDRESS.limit);

    // Another address is not held back.
    expect(
      await recordInterest({ ...request, email: "one-more@example.com" }, { db: db as never, now: later, clientKey: "k2" })
    ).toMatchObject({ ok: true });
  });

  it("refuses the request past the limit for one email, whatever the address", async () => {
    const { db, state } = fakeDb();
    for (let i = 0; i < INTEREST_PER_EMAIL.limit; i++) {
      expect(await recordInterest(request, { db: db as never, now, clientKey: `k${i}` })).toMatchObject({ ok: true });
    }

    expect(await recordInterest(request, { db: db as never, now, clientKey: "another" })).toMatchObject({
      ok: false,
      reason: "rate_limited",
    });
    expect(state.leads[0].submissions).toBe(INTEREST_PER_EMAIL.limit);
  });

  it("never writes an address or an email into a rate limit key", async () => {
    const { db, state } = fakeDb();
    await recordInterest(request, { db: db as never, now, clientKey: "0f3a9c" });

    expect(state.events.map((e) => e.key)).toEqual([
      "limelight:interest:addr:0f3a9c",
      expect.stringMatching(/^limelight:interest:email:[0-9a-f]{40}$/),
    ]);
    expect(JSON.stringify(state.events)).not.toMatch(/ana|example/i);
  });
});

describe("recordInterest: need, contact preference and phone", () => {
  const callback = { ...request, need: "redo", contactPref: "call", phone: "+1 (310) 555-0142" };

  it("ships with the columns switched on: the migration that adds them is in the repository", () => {
    expect(LEAD_DETAIL_COLUMNS).toBe(true);
  });

  it("while the columns are off: stores the lead, leaves the three fields out, and says so", async () => {
    const { db, state } = fakeDb();

    const result = await recordInterest(callback, { db: db as never, now, detailColumns: false });

    expect(result).toMatchObject({ ok: true, created: true, stored: true, detailsStored: false });
    expect(state.leads[0]).not.toHaveProperty("need");
    expect(state.leads[0]).not.toHaveProperty("contactPref");
    expect(state.leads[0]).not.toHaveProperty("phone");
    expect(logged()).toMatch(/not stored \(columns pending\), lead: lead1/);
    expect(logged()).not.toContain("555");
  });

  it("while the columns are off: a request without those fields loses nothing", async () => {
    const { db } = fakeDb();
    expect(await recordInterest(request, { db: db as never, now, detailColumns: false })).toMatchObject({
      detailsStored: true,
    });
    expect(logged()).not.toMatch(/columns pending/);
  });

  it("with the columns on: stores all three", async () => {
    const { db, state } = fakeDb();

    const result = await recordInterest(callback, { db: db as never, now, detailColumns: true });

    expect(result).toMatchObject({ ok: true, detailsStored: true });
    expect(state.leads[0]).toMatchObject({ need: "redo", contactPref: "call", phone: "+1 (310) 555-0142" });
  });

  it("with the columns on: stores no phone number for someone who did not ask for a call", async () => {
    const { db, state } = fakeDb();

    await recordInterest(
      { ...request, need: "new", contactPref: "email", phone: "+1 (310) 555-0142" },
      { db: db as never, now, detailColumns: true }
    );

    expect(state.leads[0]).toMatchObject({ need: "new", contactPref: "email", phone: null });
  });

  it("refuses a call request without a phone number, and stores nothing", async () => {
    const { db, state } = fakeDb();

    expect(
      await recordInterest({ ...request, contactPref: "call" }, { db: db as never, now, detailColumns: true })
    ).toEqual({
      ok: false,
      reason: "invalid",
      fieldErrors: { phone: "errors.phoneRequired" },
    });
    expect(state.leads).toEqual([]);
  });

  it("with the columns on: a repeat fills what was empty and replaces nothing", async () => {
    const { db, state } = fakeDb();
    await recordInterest({ ...request, need: "new" }, { db: db as never, now, detailColumns: true });
    expect(state.leads[0]).toMatchObject({ need: "new", contactPref: "email", phone: null });

    await recordInterest(callback, { db: db as never, now: later, detailColumns: true });
    expect(state.leads[0]).toMatchObject({ need: "new", contactPref: "call", phone: "+1 (310) 555-0142" });

    await recordInterest(
      { ...callback, phone: "+44 20 7946 0958" },
      { db: db as never, now: later, detailColumns: true }
    );
    expect(state.leads[0]).toMatchObject({ contactPref: "call", phone: "+1 (310) 555-0142" });
  });

  it("never puts the three fields in the alert payload", async () => {
    const { db, state } = fakeDb();
    await recordInterest(callback, { db: db as never, now, detailColumns: true });

    expect(Object.keys(JSON.parse(state.outbox[0].payload as string)).sort()).toEqual(["leadId", "reference"]);
    expect(state.outbox[0].payload).not.toMatch(/555|redo|call/);
  });
});

describe("listLimelightLeads", () => {
  async function seeded() {
    const made = fakeDb();
    await recordInterest({ ...request, email: "first@example.com" }, { db: made.db as never, now });
    await recordInterest(
      { ...request, email: "second@example.com", need: "redo", contactPref: "call", phone: "310 555 0142" },
      { db: made.db as never, now: later, detailColumns: true }
    );
    return made;
  }

  it("lists newest first, with where the alert stands", async () => {
    const { db, state } = await seeded();
    state.outbox[0].status = "SENT";

    const leads = await listLimelightLeads({}, db as never);

    expect(leads.map((l) => l.email)).toEqual(["second@example.com", "first@example.com"]);
    expect(leads.map((l) => l.alert)).toEqual(["PENDING", "SENT"]);
    expect(Object.keys(leads[0]).sort()).toEqual(
      [
        "alert", "consentVersion", "contactPref", "email", "firstSeenAt", "id", "lastSeenAt", "locale",
        "marketingOptIn", "name", "need", "performerType", "phone", "portfolioUrl", "reference", "source",
        "status", "submissions",
      ]
    );
  });

  it("returns the inquiry columns when the row has them, and blanks when it does not", async () => {
    const { db } = await seeded();
    const [second, first] = await listLimelightLeads({}, db as never);

    expect(second).toMatchObject({ need: "redo", contactPref: "call", phone: "310 555 0142" });
    expect(first).toMatchObject({ need: null, contactPref: "email", phone: null });
  });

  it("reports a lead with no alert row, or an alert that was given up", async () => {
    const { db, state } = await seeded();
    state.outbox[0].status = "DEAD";
    state.outbox.pop();

    const leads = await listLimelightLeads({}, db as never);
    expect(leads.map((l) => l.alert)).toEqual([null, "DEAD"]);
  });

  it("filters by status and bounds the limit", async () => {
    const { db, state } = await seeded();
    state.leads[0].status = "CONTACTED";

    expect((await listLimelightLeads({ status: "CONTACTED" }, db as never)).map((l) => l.email)).toEqual([
      "first@example.com",
    ]);
    expect(await listLimelightLeads({ status: "CLOSED" }, db as never)).toEqual([]);

    await listLimelightLeads({ limit: 1_000_000 }, db as never);
    expect(db.limelightLead.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 5000 }));
    await listLimelightLeads({ limit: 0 }, db as never);
    expect(db.limelightLead.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 1 }));
    await listLimelightLeads({}, db as never);
    expect(db.limelightLead.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 200 }));
  });
});

describe("changeLeadStatus", () => {
  it("changes the status and audits it in the same transaction", async () => {
    const { db, state } = fakeDb();
    await recordInterest(request, { db: db as never, now });

    expect(await changeLeadStatus("lead1", "CONTACTED", "admin1", db as never)).toEqual({
      before: "NEW",
      after: "CONTACTED",
    });
    expect(state.leads[0].status).toBe("CONTACTED");
    expect(state.audits).toEqual([
      {
        actorUserId: "admin1",
        organizationId: null,
        action: "limelight.lead.status",
        resourceType: "LimelightLead",
        resourceId: "lead1",
        before: JSON.stringify({ status: "NEW" }),
        after: JSON.stringify({ status: "CONTACTED" }),
      },
    ]);
  });

  it("writes nothing when the status is already that one", async () => {
    const { db, state } = fakeDb();
    await recordInterest(request, { db: db as never, now });

    expect(await changeLeadStatus("lead1", "NEW", "admin1", db as never)).toEqual({ before: "NEW", after: "NEW" });
    expect(state.audits).toEqual([]);
  });

  it("answers null for a lead that does not exist", async () => {
    const { db } = fakeDb();
    expect(await changeLeadStatus("nope", "CLOSED", "admin1", db as never)).toBeNull();
  });
});
