import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * disconnectProvider with a mocked session and database. What is under test:
 * a connection that is the only way in is never removed, the decision is
 * taken inside the transaction on a locked row, and the audit entry names
 * providers only.
 */

type Session = { user: { id: string; kind: string } } | null;
let session: Session = { user: { id: "u1", kind: "TALENT" } };

const tx = {
  $queryRaw: vi.fn(),
  account: { findMany: vi.fn(), deleteMany: vi.fn() },
  auditLog: { create: vi.fn() },
};
const db = {
  $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
};
const revalidatePath = vi.fn();

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/auth", () => ({ auth: async () => session }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { disconnectProvider } = await import("@/app/actions/connected-accounts");

const refusal = (key: string) => ({ ok: false, error: { key } });
const accounts = (...providers: string[]) => providers.map((provider) => ({ provider }));

beforeEach(() => {
  vi.clearAllMocks();
  session = { user: { id: "u1", kind: "TALENT" } };
  tx.$queryRaw.mockResolvedValue([{ hasPassword: true }]);
  tx.account.findMany.mockResolvedValue(accounts("google"));
  tx.account.deleteMany.mockResolvedValue({ count: 1 });
});

describe("disconnectProvider", () => {
  it("is refused without a session", async () => {
    session = null;
    expect(await disconnectProvider("google")).toEqual(refusal("errors.unauthorized"));
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("answers not connected for a provider that is not linked", async () => {
    tx.account.findMany.mockResolvedValue(accounts("apple"));
    expect(await disconnectProvider("google")).toEqual(refusal("errors.providerNotConnected"));
    tx.account.findMany.mockResolvedValue([]);
    expect(await disconnectProvider("apple")).toEqual(refusal("errors.providerNotConnected"));
    expect(tx.account.deleteMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("answers not connected for a name this app does not know, without a query", async () => {
    expect(await disconnectProvider("github" as "google")).toEqual(
      refusal("errors.providerNotConnected")
    );
    expect(await disconnectProvider(undefined as unknown as "google")).toEqual(
      refusal("errors.providerNotConnected")
    );
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses to remove the only way in, and changes nothing", async () => {
    tx.$queryRaw.mockResolvedValue([{ hasPassword: false }]);
    tx.account.findMany.mockResolvedValue(accounts("google"));
    expect(await disconnectProvider("google")).toEqual(refusal("errors.lastLoginMethod"));
    expect(tx.account.deleteMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("disconnects when a password remains", async () => {
    expect(await disconnectProvider("google")).toEqual({ ok: true });
    expect(tx.account.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", provider: "google" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/talents/(space)", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/casting/(space)", "layout");
  });

  it("disconnects when another provider remains, password or not", async () => {
    tx.$queryRaw.mockResolvedValue([{ hasPassword: false }]);
    tx.account.findMany.mockResolvedValue(accounts("google", "apple"));
    expect(await disconnectProvider("apple")).toEqual({ ok: true });
    expect(tx.account.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", provider: "apple" },
    });
  });

  it("works for a casting account too", async () => {
    session = { user: { id: "u2", kind: "CASTING" } };
    expect(await disconnectProvider("google")).toEqual({ ok: true });
    expect(tx.account.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u2", provider: "google" },
    });
  });

  it("decides inside the transaction, on the user's locked row, before deleting", async () => {
    const order: string[] = [];
    tx.$queryRaw.mockImplementation(async () => {
      order.push("lock");
      return [{ hasPassword: true }];
    });
    tx.account.findMany.mockImplementation(async () => {
      order.push("read connections");
      return accounts("google");
    });
    tx.account.deleteMany.mockImplementation(async () => {
      order.push("delete");
      return { count: 1 };
    });
    tx.auditLog.create.mockImplementation(async () => void order.push("audit"));

    await disconnectProvider("google");

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["lock", "read connections", "delete", "audit"]);
    const [sql, ...values] = tx.$queryRaw.mock.calls[0] as [string[], ...unknown[]];
    // The user id comes from the session; the row is locked; only a yes or no
    // about the password is read.
    expect(values).toEqual(["u1"]);
    expect(sql.join("?")).toMatch(/FOR UPDATE/);
    expect(sql.join("?")).toMatch(/"passwordHash" IS NOT NULL AS "hasPassword"/);
    expect(tx.account.findMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      select: { provider: true },
    });
  });

  it("audits the unlink with provider names only", async () => {
    tx.$queryRaw.mockResolvedValue([{ hasPassword: false }]);
    tx.account.findMany.mockResolvedValue(accounts("apple", "google"));
    await disconnectProvider("google");
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const { data } = tx.auditLog.create.mock.calls[0][0] as { data: Record<string, string> };
    expect(data).toMatchObject({
      actorUserId: "u1",
      action: "auth.oauth.unlink",
      resourceType: "User",
      resourceId: "u1",
    });
    expect(JSON.parse(data.before)).toEqual({ providers: ["apple", "google"], hasPassword: false });
    expect(JSON.parse(data.after)).toEqual({ provider: "google", providers: ["apple"] });
  });

  it("answers unauthorized when the account no longer exists", async () => {
    tx.$queryRaw.mockResolvedValue([]);
    expect(await disconnectProvider("google")).toEqual(refusal("errors.unauthorized"));
    expect(tx.account.deleteMany).not.toHaveBeenCalled();
  });
});
