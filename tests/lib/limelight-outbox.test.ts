import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `drainOutbox` against an in-memory OutboxMessage table that honors the
 * conditions of each write, which is what the claim rests on: a write that
 * names the row "as read" matches nothing once the row moved. The mailer is
 * a function handed in, so nothing here can reach the network.
 */

vi.mock("@/lib/db", () => ({ prisma: {} }));

const {
  CLAIM_LEASE_MS,
  LEAD_ALERT_KIND,
  LIMELIGHT_OWNER_VIEW_PATH,
  alertRecipient,
  backoffMs,
  drainOutbox,
  leadAlertDedupeKey,
  leadAlertEmail,
  redactError,
} = await import("@/lib/limelight/outbox");

interface Message {
  id: string;
  kind: string;
  dedupeKey: string;
  payload: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
  sentAt: Date | null;
}

type Where = Partial<Pick<Message, "id" | "kind" | "status" | "attempts">> & {
  nextAttemptAt?: Date | { lte: Date };
};

function matches(row: Message, where: Where): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.kind !== undefined && row.kind !== where.kind) return false;
  if (where.status !== undefined && row.status !== where.status) return false;
  if (where.attempts !== undefined && row.attempts !== where.attempts) return false;
  if (where.nextAttemptAt instanceof Date) {
    if (row.nextAttemptAt.getTime() !== where.nextAttemptAt.getTime()) return false;
  } else if (where.nextAttemptAt) {
    if (row.nextAttemptAt.getTime() > where.nextAttemptAt.lte.getTime()) return false;
  }
  return true;
}

function fakeOutbox(rows: Message[]) {
  const outboxMessage = {
    count: vi.fn(async ({ where }: { where: Where }) => rows.filter((r) => matches(r, where)).length),
    findMany: vi.fn(async ({ where, take }: { where: Where; take: number }) =>
      rows
        .filter((r) => matches(r, where))
        .sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime())
        .slice(0, take)
        .map((r) => ({ ...r }))
    ),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: Partial<Message> }) => {
      const hit = rows.filter((r) => matches(r, where));
      for (const row of hit) Object.assign(row, data);
      return { count: hit.length };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Message> }) => {
      const row = rows.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return { ...row };
    }),
  };
  return { outboxMessage };
}

const now = new Date("2026-11-19T10:00:00Z");
const minutes = (n: number) => new Date(now.getTime() + n * 60 * 1000);

function alert(over: Partial<Message> = {}): Message {
  const id = over.id ?? "m1";
  return {
    id,
    kind: LEAD_ALERT_KIND,
    dedupeKey: leadAlertDedupeKey(`lead-${id}`),
    payload: JSON.stringify({ leadId: `lead-${id}`, reference: "LL-7K2M9QXA" }),
    status: "PENDING",
    attempts: 0,
    maxAttempts: 5,
    nextAttemptAt: now,
    lastError: null,
    sentAt: null,
    ...over,
  };
}

const env = {
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "Agental <no-reply@agental.test>",
  LIMELIGHT_ALERT_EMAIL: "owner@agental.test",
};
const delivered = () => vi.fn(async () => ({ ok: true as const, mode: "resend" as const }));
const refused = () => vi.fn(async () => ({ ok: false as const }));

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("backoffMs", () => {
  it("doubles from five minutes and stops growing at six hours", () => {
    const min = 60 * 1000;
    expect([1, 2, 3, 4, 5].map(backoffMs)).toEqual([5 * min, 10 * min, 20 * min, 40 * min, 80 * min]);
    expect(backoffMs(8)).toBe(6 * 60 * min);
    expect(backoffMs(500)).toBe(6 * 60 * min);
    expect(backoffMs(0)).toBe(5 * min);
  });
});

describe("redactError", () => {
  it("keeps the kind of failure and removes addresses, links and keys", () => {
    const error = new TypeError(
      "fetch failed for owner@agental.test at https://api.resend.com/emails?key=1 with re_1234567890abcdefghijklmn"
    );
    const stored = redactError(error);

    expect(stored).toBe("TypeError: fetch failed for [email] at [url] with [redacted]");
    expect(stored).not.toMatch(/agental\.test|resend\.com|re_123/);
  });

  it("is short, and copes with anything thrown", () => {
    expect(redactError(new Error("x ".repeat(500))).length).toBeLessThanOrEqual(200);
    expect(redactError("plain string")).toBe("Error: plain string");
    expect(redactError(undefined)).toBe("Error");
    expect(redactError(new Error(""))).toBe("Error");
  });
});

describe("alertRecipient", () => {
  it("reads LIMELIGHT_ALERT_EMAIL, and treats a blank or a broken value as missing", () => {
    expect(alertRecipient({ LIMELIGHT_ALERT_EMAIL: " owner@agental.test " })).toBe("owner@agental.test");
    expect(alertRecipient({})).toBeNull();
    expect(alertRecipient({ LIMELIGHT_ALERT_EMAIL: "  " })).toBeNull();
    expect(alertRecipient({ LIMELIGHT_ALERT_EMAIL: "owner" })).toBeNull();
    expect(alertRecipient({ LIMELIGHT_ALERT_EMAIL: "a@agental.test, b@agental.test" })).toBeNull();
  });
});

describe("leadAlertEmail", () => {
  it("carries the reference and the owner view path, and nothing else", () => {
    const email = leadAlertEmail("LL-7K2M9QXA", "owner@agental.test");

    expect(email.to).toBe("owner@agental.test");
    expect(email.subject).toBe("Limelight request LL-7K2M9QXA");
    expect(email.text).toContain("Reference: LL-7K2M9QXA");
    expect(email.text).toContain(`${LIMELIGHT_OWNER_VIEW_PATH}?ref=LL-7K2M9QXA`);
    expect(email.html).toContain("LL-7K2M9QXA");
    // A path, never an absolute link, and no address anywhere in the body.
    expect(`${email.text}${email.html}`).not.toMatch(/https?:\/\//);
    expect(`${email.subject}${email.text}${email.html}`).not.toContain("@");
  });
});

describe("drainOutbox", () => {
  it("sends a due alert to the alert address and marks it SENT", async () => {
    const rows = [alert()];
    const send = delivered();

    const result = await drainOutbox({ db: fakeOutbox(rows) as never, env, now, send });

    expect(result).toEqual({ configured: true, due: 1, sent: 1, retried: 0, dead: 0, skipped: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0] as unknown[])[0]).toMatchObject({
      to: "owner@agental.test",
      subject: "Limelight request LL-7K2M9QXA",
    });
    expect(rows[0]).toMatchObject({ status: "SENT", sentAt: now, attempts: 1, lastError: null });
  });

  it("leaves alone what is not due, already sent, dead, or of another kind", async () => {
    const rows = [
      alert({ id: "later", nextAttemptAt: minutes(1) }),
      alert({ id: "sent", status: "SENT", sentAt: minutes(-60) }),
      alert({ id: "dead", status: "DEAD" }),
      alert({ id: "other", kind: "something.else" }),
    ];
    const before = JSON.stringify(rows);
    const send = delivered();

    expect(await drainOutbox({ db: fakeOutbox(rows) as never, env, now, send })).toMatchObject({ due: 0, sent: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("handles at most `limit` rows, the longest waiting first", async () => {
    const rows = [
      alert({ id: "c", nextAttemptAt: minutes(-1) }),
      alert({ id: "a", nextAttemptAt: minutes(-30) }),
      alert({ id: "b", nextAttemptAt: minutes(-10) }),
    ];

    expect(await drainOutbox({ db: fakeOutbox(rows) as never, env, now, send: delivered(), limit: 2 })).toMatchObject({
      due: 2,
      sent: 2,
    });
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      ["c", "PENDING"],
      ["a", "SENT"],
      ["b", "SENT"],
    ]);
  });

  describe("when the sender or the alert address is not configured", () => {
    it.each([
      ["no Resend key", { ...env, RESEND_API_KEY: "" }],
      ["no sender address", { ...env, EMAIL_FROM: undefined }],
      ["no alert address", { ...env, LIMELIGHT_ALERT_EMAIL: "" }],
      ["an alert address that is not one", { ...env, LIMELIGHT_ALERT_EMAIL: "the owner" }],
      ["nothing at all", {}],
    ])("%s: the row stays PENDING and no attempt is used", async (_label, missing) => {
      const rows = [alert({ attempts: 2, lastError: "earlier" })];
      const before = JSON.stringify(rows);
      const db = fakeOutbox(rows);
      const send = delivered();

      const result = await drainOutbox({ db: db as never, env: missing, now, send });

      expect(result).toEqual({ configured: false, due: 1, sent: 0, retried: 0, dead: 0, skipped: 0 });
      expect(send).not.toHaveBeenCalled();
      expect(JSON.stringify(rows)).toBe(before);
      expect(db.outboxMessage.updateMany).not.toHaveBeenCalled();
      expect(db.outboxMessage.update).not.toHaveBeenCalled();
    });

    it("can wait through any number of drains and is sent once the key arrives", async () => {
      const rows = [alert()];
      const db = fakeOutbox(rows);
      for (let i = 0; i < 20; i++) {
        await drainOutbox({ db: db as never, env: {}, now: minutes(i * 60), send: delivered() });
      }
      expect(rows[0]).toMatchObject({ status: "PENDING", attempts: 0 });

      expect(await drainOutbox({ db: db as never, env, now: minutes(21 * 60), send: delivered() })).toMatchObject({
        sent: 1,
      });
      expect(rows[0]).toMatchObject({ status: "SENT", attempts: 1 });
    });

    it("hands the try back if the sender turns out to be in log mode after all", async () => {
      const rows = [alert({ attempts: 1, nextAttemptAt: minutes(-2) })];
      const logMode = vi.fn(async () => ({ ok: true as const, mode: "log" as const }));

      const result = await drainOutbox({ db: fakeOutbox(rows) as never, env, now, send: logMode });

      expect(result).toMatchObject({ sent: 0, skipped: 1 });
      expect(rows[0]).toMatchObject({ status: "PENDING", attempts: 1, nextAttemptAt: minutes(-2), sentAt: null });
    });
  });

  describe("when sending fails", () => {
    it("counts the attempt, waits five minutes, and keeps a redacted reason", async () => {
      const rows = [alert()];

      const result = await drainOutbox({ db: fakeOutbox(rows) as never, env, now, send: refused() });

      expect(result).toEqual({ configured: true, due: 1, sent: 0, retried: 1, dead: 0, skipped: 0 });
      expect(rows[0]).toMatchObject({
        status: "PENDING",
        attempts: 1,
        nextAttemptAt: minutes(5),
        sentAt: null,
      });
      expect(rows[0].lastError).toMatch(/refused|reached/);
    });

    it("stores what a thrown error says without the address or the key in it", async () => {
      const rows = [alert()];
      const send = vi.fn(async () => {
        throw new Error("could not deliver to owner@agental.test with key re_1234567890abcdefghijklmn");
      });

      await drainOutbox({ db: fakeOutbox(rows) as never, env, now, send });

      expect(rows[0].lastError).toBe("Error: could not deliver to [email] with key [redacted]");
    });

    it("is not retried before its wait is over, and waits longer each time", async () => {
      const rows = [alert()];
      const db = fakeOutbox(rows);
      const send = refused();

      await drainOutbox({ db: db as never, env, now, send });
      // One minute later: not due.
      expect(await drainOutbox({ db: db as never, env, now: minutes(1), send })).toMatchObject({ due: 0 });
      expect(send).toHaveBeenCalledTimes(1);

      // Due again after 5 minutes; the second failure waits 10.
      await drainOutbox({ db: db as never, env, now: minutes(5), send });
      expect(rows[0]).toMatchObject({ attempts: 2, nextAttemptAt: minutes(15) });
      // The third waits 20.
      await drainOutbox({ db: db as never, env, now: minutes(15), send });
      expect(rows[0]).toMatchObject({ attempts: 3, nextAttemptAt: minutes(35) });
    });

    it("is sent by a later drain once the provider answers again", async () => {
      const rows = [alert()];
      const db = fakeOutbox(rows);

      await drainOutbox({ db: db as never, env, now, send: refused() });
      const result = await drainOutbox({ db: db as never, env, now: minutes(6), send: delivered() });

      expect(result).toMatchObject({ sent: 1 });
      expect(rows[0]).toMatchObject({ status: "SENT", attempts: 2, sentAt: minutes(6), lastError: null });
    });

    it("becomes DEAD at maxAttempts and is never tried again", async () => {
      const rows = [alert({ maxAttempts: 3 })];
      const db = fakeOutbox(rows);
      const send = refused();

      const first = await drainOutbox({ db: db as never, env, now, send });
      const second = await drainOutbox({ db: db as never, env, now: minutes(5), send });
      const third = await drainOutbox({ db: db as never, env, now: minutes(15), send });

      expect([first.retried, second.retried, third.retried]).toEqual([1, 1, 0]);
      expect(third).toMatchObject({ dead: 1 });
      expect(rows[0]).toMatchObject({ status: "DEAD", attempts: 3, sentAt: null });
      expect(rows[0].lastError).toBeTruthy();

      expect(await drainOutbox({ db: db as never, env, now: minutes(24 * 60), send })).toMatchObject({ due: 0 });
      expect(send).toHaveBeenCalledTimes(3);
    });

    it("marks a row with an unreadable payload DEAD at once, without sending", async () => {
      for (const payload of ["{", "{}", JSON.stringify({ reference: "ana@example.com" }), "null"]) {
        const rows = [alert({ payload })];
        const send = delivered();

        expect(await drainOutbox({ db: fakeOutbox(rows) as never, env, now, send })).toMatchObject({ dead: 1, sent: 0 });
        expect(send).not.toHaveBeenCalled();
        expect(rows[0]).toMatchObject({ status: "DEAD", lastError: "Unreadable payload." });
      }
    });
  });

  describe("two drains at the same moment", () => {
    it("send one alert once: the second drain's claim matches nothing", async () => {
      const rows = [alert()];
      const db = fakeOutbox(rows);
      const send = delivered();

      const [a, b] = await Promise.all([
        drainOutbox({ db: db as never, env, now, send }),
        drainOutbox({ db: db as never, env, now, send }),
      ]);

      expect(send).toHaveBeenCalledTimes(1);
      expect(a.sent + b.sent).toBe(1);
      expect(a.skipped + b.skipped).toBe(1);
      expect(rows[0]).toMatchObject({ status: "SENT", attempts: 1 });
    });

    it("claim by adding the attempt and pushing the row five minutes ahead, as read", async () => {
      const rows = [alert({ attempts: 1, nextAttemptAt: minutes(-3) })];
      const db = fakeOutbox(rows);
      let seenWhileSending: Message | undefined;
      const send = vi.fn(async () => {
        seenWhileSending = { ...rows[0] };
        return { ok: true as const, mode: "resend" as const };
      });

      await drainOutbox({ db: db as never, env, now, send });

      expect(db.outboxMessage.updateMany).toHaveBeenCalledWith({
        where: { id: "m1", status: "PENDING", attempts: 1, nextAttemptAt: minutes(-3) },
        data: { attempts: 2, nextAttemptAt: new Date(now.getTime() + CLAIM_LEASE_MS) },
      });
      // While the email is on its way the row is already out of reach of
      // another drain: not due for five minutes.
      expect(seenWhileSending).toMatchObject({ status: "PENDING", attempts: 2, nextAttemptAt: minutes(5) });
    });

    it("skips a row that another drain took between the read and the claim", async () => {
      const rows = [alert()];
      const db = fakeOutbox(rows);
      db.outboxMessage.findMany.mockImplementationOnce(async () => {
        const read = [{ ...rows[0] }];
        // The other drain claims it right after this read.
        rows[0].attempts = 1;
        rows[0].nextAttemptAt = minutes(5);
        return read;
      });
      const send = delivered();

      expect(await drainOutbox({ db: db as never, env, now, send })).toMatchObject({ due: 1, sent: 0, skipped: 1 });
      expect(send).not.toHaveBeenCalled();
      expect(rows[0]).toMatchObject({ status: "PENDING", attempts: 1 });
    });

    it("retries a claim that was never settled once its five minutes are over", async () => {
      // A process claimed the row and stopped before recording the outcome.
      const rows = [alert({ attempts: 1, nextAttemptAt: minutes(5) })];
      const db = fakeOutbox(rows);
      const send = delivered();

      expect(await drainOutbox({ db: db as never, env, now: minutes(4), send })).toMatchObject({ due: 0 });
      expect(await drainOutbox({ db: db as never, env, now: minutes(5), send })).toMatchObject({ sent: 1 });
      expect(rows[0]).toMatchObject({ status: "SENT", attempts: 2 });
    });

    it("marks DEAD, without sending, a row left claimed on its last attempt", async () => {
      const rows = [alert({ attempts: 5, maxAttempts: 5, nextAttemptAt: minutes(-1), lastError: "earlier failure" })];
      const send = delivered();

      expect(await drainOutbox({ db: fakeOutbox(rows) as never, env, now, send })).toMatchObject({ dead: 1, sent: 0 });
      expect(send).not.toHaveBeenCalled();
      expect(rows[0]).toMatchObject({ status: "DEAD", attempts: 5, lastError: "earlier failure" });
    });
  });
});
