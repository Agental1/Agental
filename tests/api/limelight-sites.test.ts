import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Limelight sites against a real Postgres: who may touch whose site, and
 * what the public sees.
 *
 * The rules under test are shapes of queries and conditional writes: a
 * mocked Prisma would only repeat what the mock was told. Two customers and
 * one operator are created; customer B tries everything on customer A's
 * site; then the path from draft to a public hostname is walked, checking at
 * each step what `resolveSiteByHost` answers.
 *
 * Only the session and DNS are faked. Needs DATABASE_URL pointing at a test
 * database with the migrations applied (DATABASE_POOL_MAX=1 against the
 * local single-connection server). Skipped without it. Every row hangs off a
 * user created here, tagged with this run, and is removed in afterAll.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = "test-ll-sites-";
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const RUN = `${TAG}${RUN_ID}`;
// A root domain of this run alone, so hostnames never meet another run's.
const ROOT = `ll${RUN_ID}.sites-test.example.org`;

const session: { user: { id: string; kind: string } | null } = { user: null };
const dns: { records: Record<string, string[][]> } = { records: {} };

vi.mock("@/auth", () => ({ auth: async () => (session.user ? { user: session.user } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("node:dns/promises", () => ({
  resolveTxt: async (name: string) => {
    const found = dns.records[name];
    if (!found) throw Object.assign(new Error("queryTxt ENOTFOUND"), { code: "ENOTFOUND" });
    return found;
  },
}));

describe.skipIf(!hasDb)("Limelight sites, end to end", () => {
  let prisma: typeof import("@/lib/db")["prisma"];
  let actions: typeof import("@/app/actions/sites");
  let sites: typeof import("@/lib/sites");
  let hosts: typeof import("@/lib/limelight/hosts");
  let domains: typeof import("@/lib/limelight/domains");

  let a = "";
  let b = "";
  let op = "";

  const as = (userId: string, kind = "TALENT") => {
    session.user = { id: userId, kind };
  };
  const asB = () => as(b);
  const asOperator = () => as(op, "CASTING");

  const NOT_FOUND = { ok: false, error: { key: "errors.siteNotFound" } };
  const content = (over: Record<string, unknown> = {}) => ({
    name: `Zed ${RUN_ID}`,
    headline: "Actor, Los Angeles",
    bio: "Bilingual.",
    contactEmail: "zed@contact.example.org",
    links: [{ label: "IMDb", url: "https://www.imdb.com/name/nm0000001/" }],
    ...over,
  });

  const users: string[] = [];
  let customers = 0;

  /** A new talent account. A customer may keep three sites, so most tests take their own. */
  async function customer(): Promise<string> {
    const user = await prisma.user.create({
      data: { email: `${RUN}-c${++customers}@test.local`, kind: "TALENT" },
    });
    users.push(user.id);
    return user.id;
  }

  /** A new draft, saved by its owner (a new customer unless one is given). The session stays the owner's. */
  async function newSite(over: Record<string, unknown> = {}, owner?: string) {
    const ownerId = owner ?? (await customer());
    as(ownerId);
    const saved = await actions.saveSite({ template: "marquee", content: content(over) });
    if (!saved.ok) throw new Error(`could not create the site: ${saved.error.key}`);
    return { siteId: saved.siteId, owner: ownerId };
  }

  /** A site approved by its owner and published. Returns its public hostname. */
  async function publishedSite(over: Record<string, unknown> = {}, owner?: string) {
    const site = await newSite(over, owner);
    expect(await actions.approveSitePreview(site.siteId)).toMatchObject({ ok: true });
    const published = await actions.publishSite(site.siteId);
    if (!published.ok) throw new Error(`could not publish: ${published.error.key}`);
    return { ...site, subdomain: published.subdomain, host: `${published.subdomain}.${ROOT}` };
  }

  const row = (siteId: string) => prisma.site.findUniqueOrThrow({ where: { id: siteId } });
  const revisions = (siteId: string) =>
    prisma.siteRevision.findMany({ where: { siteId }, orderBy: { version: "asc" } });

  beforeAll(async () => {
    vi.stubEnv("LIMELIGHT_ROOT_DOMAIN", ROOT);
    vi.stubEnv("LIMELIGHT_CNAME_TARGET", "");
    vi.stubEnv("LIMELIGHT_APP_HOSTS", "");
    ({ prisma } = await import("@/lib/db"));
    actions = await import("@/app/actions/sites");
    sites = await import("@/lib/sites");
    hosts = await import("@/lib/limelight/hosts");
    domains = await import("@/lib/limelight/domains");

    // What an interrupted earlier run left behind (sites go with their user).
    await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });

    const [userA, userB, operator] = [
      await prisma.user.create({ data: { email: `${RUN}-a@test.local`, kind: "TALENT" } }),
      await prisma.user.create({ data: { email: `${RUN}-b@test.local`, kind: "TALENT" } }),
      await prisma.user.create({ data: { email: `${RUN}-op@test.local`, kind: "CASTING", isAdmin: true } }),
    ];
    a = userA.id;
    b = userB.id;
    op = operator.id;
    users.push(a, b, op);
  });

  beforeEach(() => {
    session.user = null;
    dns.records = {};
  });

  afterAll(async () => {
    const mine = { in: users };
    await prisma.siteOrder.deleteMany({ where: { userId: mine } });
    // Revisions and domains go with their site.
    await prisma.site.deleteMany({ where: { userId: mine } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: mine } });
    await prisma.user.deleteMany({ where: { email: { startsWith: RUN } } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  describe("revisions", () => {
    it("every save writes the next revision, a copy of the site row", async () => {
      const { siteId, owner } = await newSite();
      await actions.saveSite({ siteId, template: "studio", content: content({ headline: "Second" }) });
      await actions.saveSite({ siteId, template: "studio", content: content({ headline: "Third" }) });

      const history = await revisions(siteId);
      expect(history.map((r) => [r.version, r.template, r.createdById])).toEqual([
        [1, "marquee", owner],
        [2, "studio", owner],
        [3, "studio", owner],
      ]);
      expect(JSON.parse(history[1].content).headline).toBe("Second");
      const site = await row(siteId);
      expect(history[2].content).toBe(site.content);
      expect(history[2].template).toBe(site.template);
    });

    it("two saves at the same moment take two different version numbers", async () => {
      const { siteId } = await newSite();

      const results = await Promise.all([
        actions.saveSite({ siteId, template: "marquee", content: content({ headline: "One" }) }),
        actions.saveSite({ siteId, template: "marquee", content: content({ headline: "Two" }) }),
      ]);

      expect(results).toEqual([{ ok: true, siteId }, { ok: true, siteId }]);
      expect((await revisions(siteId)).map((r) => r.version)).toEqual([1, 2, 3]);
    });

    it("a save that is refused writes no revision", async () => {
      const { siteId } = await newSite();

      expect(await actions.saveSite({ siteId, template: "marquee", content: { name: "" } })).toEqual({
        ok: false,
        error: { key: "errors.siteInvalid" },
      });
      expect(await revisions(siteId)).toHaveLength(1);
    });
  });

  describe("two customers: B can do nothing to A's site", () => {
    let siteId = "";
    let host = "";
    let domainId = "";
    let before: Awaited<ReturnType<typeof row>>;

    beforeAll(async () => {
      ({ siteId, host } = await publishedSite({}, a));
      const added = await actions.addSiteDomain(siteId, `www.a-${RUN_ID}.com`);
      if (!added.ok) throw new Error("could not add A's domain");
      domainId = added.domainId;
      before = await row(siteId);
    });

    async function expectUntouched() {
      expect(await row(siteId)).toEqual(before);
      expect(await revisions(siteId)).toHaveLength(1);
    }

    it("B cannot save it", async () => {
      asB();
      expect(
        await actions.saveSite({ siteId, template: "studio", content: content({ name: "Taken Over" }) })
      ).toEqual(NOT_FOUND);
      await expectUntouched();
    });

    it("B cannot approve it", async () => {
      // A new draft that A has not approved: B's approval must not count.
      const { siteId: draftId } = await newSite({ name: `Unapproved ${RUN_ID}` }, a);
      asB();
      expect(await actions.approveSitePreview(draftId)).toEqual(NOT_FOUND);
      expect(await actions.approveSitePreview(siteId)).toEqual(NOT_FOUND);
      expect((await row(draftId)).approvedRevisionId).toBeNull();
      await expectUntouched();
    });

    it("B cannot publish or unpublish it", async () => {
      asB();
      expect(await actions.publishSite(siteId)).toEqual(NOT_FOUND);
      expect(await actions.unpublishSite(siteId)).toEqual(NOT_FOUND);
      await expectUntouched();
      // Still online for the public.
      expect(await hosts.resolveSiteByHost(host)).not.toBeNull();
    });

    it("B cannot change what contact details it shows", async () => {
      asB();
      expect(await actions.setSiteContactVisibility(siteId, true)).toEqual(NOT_FOUND);
      await expectUntouched();
    });

    it("B cannot add a domain to it, nor check or remove the one it has", async () => {
      asB();
      expect(await actions.addSiteDomain(siteId, `www.b-${RUN_ID}.com`)).toEqual(NOT_FOUND);
      dns.records[`_agental-verify.www.a-${RUN_ID}.com`] = [["anything"]];
      expect(await actions.verifySiteDomain(domainId)).toEqual({ ok: false, error: { key: "errors.notFound" } });
      expect(await actions.removeSiteDomain(domainId)).toEqual({ ok: false, error: { key: "errors.notFound" } });
      expect(await actions.activateSiteDomain(domainId)).toEqual({ ok: false, error: { key: "errors.forbidden" } });

      const domainsNow = await prisma.siteDomain.findMany({ where: { siteId }, orderBy: { kind: "asc" } });
      expect(domainsNow.map((d) => [d.kind, d.hostname, d.status])).toEqual([
        ["CUSTOM", `www.a-${RUN_ID}.com`, "PENDING"],
        ["SUBDOMAIN", host, "ACTIVE"],
      ]);
      expect(domainsNow[0].lastCheckedAt).toBeNull();
    });

    it("B cannot take the hostname A already claimed for a site of their own", async () => {
      asB();
      const mine = await actions.saveSite({ template: "marquee", content: content({ name: `Bee ${RUN_ID}` }) });
      if (!mine.ok) throw new Error("could not create B's site");

      const result = await actions.addSiteDomain(mine.siteId, `www.a-${RUN_ID}.com`);

      expect(result).toEqual({ ok: false, error: { key: "errors.domainTaken" } });
      expect(await prisma.siteDomain.count({ where: { siteId: mine.siteId } })).toBe(0);
    });

    it("B cannot read it: not by id, and not in their own list", async () => {
      expect(await sites.getSiteForOwner(b, siteId)).toBeNull();
      expect((await sites.listMySites(b)).map((site) => site.id)).not.toContain(siteId);
      // While A reads it.
      expect(await sites.getSiteForOwner(a, siteId)).toMatchObject({ id: siteId, userId: a });
      expect((await sites.listMySites(a)).map((site) => site.id)).toContain(siteId);
    });

    it("B gets the same answer for A's site as for a site that does not exist", async () => {
      asB();
      const input = { template: "marquee", content: content() };
      expect(await actions.saveSite({ ...input, siteId: "no-such-site" })).toEqual(
        await actions.saveSite({ ...input, siteId })
      );
      expect(await actions.publishSite("no-such-site")).toEqual(await actions.publishSite(siteId));
      expect(await actions.approveSitePreview("no-such-site")).toEqual(await actions.approveSitePreview(siteId));
    });

    it("B cannot open a site in A's name", async () => {
      asB();
      const sitesOfA = await prisma.site.count({ where: { userId: a } });

      expect(await actions.saveSite({ template: "marquee", content: content(), ownerId: a })).toEqual({
        ok: false,
        error: { key: "errors.forbidden" },
      });
      expect(await prisma.site.count({ where: { userId: a } })).toBe(sitesOfA);
    });

    it("a visitor gets nothing at all", async () => {
      session.user = null;
      const unauthorized = { ok: false, error: { key: "errors.unauthorized" } };
      expect(await actions.saveSite({ siteId, template: "marquee", content: content() })).toEqual(unauthorized);
      expect(await actions.approveSitePreview(siteId)).toEqual(unauthorized);
      expect(await actions.publishSite(siteId)).toEqual(unauthorized);
      expect(await actions.unpublishSite(siteId)).toEqual(unauthorized);
      expect(await actions.addSiteDomain(siteId, `www.v-${RUN_ID}.com`)).toEqual(unauthorized);
      await expectUntouched();
    });
  });

  describe("customer and operator", () => {
    it("the operator assembles a site for a customer; only the customer approves", async () => {
      const owner = await customer();
      asOperator();
      const created = await actions.saveSite({
        template: "voice-booth",
        content: content({ name: `Assembled ${RUN_ID}` }),
        ownerId: owner,
      });
      if (!created.ok) throw new Error(`operator could not create: ${created.error.key}`);
      const siteId = created.siteId;
      expect((await row(siteId)).userId).toBe(owner);

      // The operator edits it too.
      expect(
        await actions.saveSite({ siteId, template: "voice-booth", content: content({ name: `Assembled ${RUN_ID}`, headline: "Edited by the team" }) })
      ).toEqual({ ok: true, siteId });
      expect((await revisions(siteId)).map((r) => [r.version, r.createdById])).toEqual([
        [1, op],
        [2, op],
      ]);

      // The operator may not approve, and nothing is approved by trying.
      expect(await actions.approveSitePreview(siteId)).toEqual({ ok: false, error: { key: "errors.forbidden" } });
      expect((await row(siteId)).approvedRevisionId).toBeNull();
      // So the operator cannot publish yet either.
      expect(await actions.publishSite(siteId)).toEqual({ ok: false, error: { key: "errors.siteNotApproved" } });
      expect((await row(siteId)).status).toBe("DRAFT");

      // The customer sees it among their sites, and approves.
      as(owner);
      expect(await sites.getSiteForOwner(owner, siteId)).toMatchObject({ latestVersion: 2, approvedVersion: null });
      const approved = await actions.approveSitePreview(siteId, 2);
      expect(approved).toMatchObject({ ok: true, version: 2 });
      const site = await row(siteId);
      expect(site).toMatchObject({ approvedById: owner });
      expect(site.approvedAt).toBeInstanceOf(Date);

      // Now the operator publishes what the customer approved.
      asOperator();
      const published = await actions.publishSite(siteId);
      expect(published).toMatchObject({ ok: true });
      expect((await row(siteId)).publishedRevisionId).toBe(site.approvedRevisionId);

      // Each step by the operator left an audit entry.
      const trail = await prisma.auditLog.findMany({
        where: { actorUserId: op, resourceId: siteId },
        orderBy: { createdAt: "asc" },
      });
      expect(trail.map((entry) => entry.action)).toEqual([
        "limelight.site.operator_save",
        "limelight.site.operator_save",
        "limelight.site.publish",
      ]);
    });

    it("the operator cannot turn a customer's contact details on", async () => {
      const { siteId } = await newSite();
      asOperator();

      expect(await actions.setSiteContactVisibility(siteId, true)).toEqual({
        ok: false,
        error: { key: "errors.forbidden" },
      });
      expect((await row(siteId)).showContact).toBe(false);
    });

    it("an approval refuses a preview that changed since the customer saw it", async () => {
      const { siteId, owner } = await newSite();
      asOperator();
      await actions.saveSite({ siteId, template: "marquee", content: content({ headline: "Changed meanwhile" }) });

      as(owner);
      // The customer's page showed version 1.
      expect(await actions.approveSitePreview(siteId, 1)).toEqual({
        ok: false,
        error: { key: "errors.sitePreviewChanged" },
      });
      const site = await row(siteId);
      expect(site.approvedRevisionId).toBeNull();
      // The refused attempt left no trace: who and when roll back with it.
      expect(site.approvedAt).toBeNull();
      expect(site.approvedById).toBeNull();
    });
  });

  describe("what the public sees", () => {
    it("an unknown host, and anything that is not a hostname, resolve to nothing", async () => {
      for (const host of [
        `nobody-${RUN_ID}.${ROOT}`,
        `www.unknown-${RUN_ID}.com`,
        ROOT,
        "",
        "127.0.0.1",
        "https://evil.example/",
        `a.${ROOT}/../admin`,
        `x' OR '1'='1.${ROOT}`,
      ]) {
        expect(await hosts.resolveSiteByHost(host)).toBeNull();
      }
    });

    it("a draft does not resolve, even with an active hostname pointing at it", async () => {
      const { siteId } = await newSite({ name: `Draft ${RUN_ID}` });
      const hostname = `draft-${RUN_ID}.${ROOT}`;
      await prisma.siteDomain.create({
        data: { siteId, hostname, kind: "SUBDOMAIN", status: "ACTIVE", verificationToken: "" },
      });

      expect(await hosts.resolveSiteByHost(hostname)).toBeNull();

      // Approved is still not published.
      await actions.approveSitePreview(siteId);
      expect(await hosts.resolveSiteByHost(hostname)).toBeNull();
    });

    it("a site cannot be published before the customer approved it", async () => {
      const { siteId } = await newSite({ name: `Eager ${RUN_ID}` });

      expect(await actions.publishSite(siteId)).toEqual({ ok: false, error: { key: "errors.siteNotApproved" } });
      const site = await row(siteId);
      expect(site).toMatchObject({ status: "DRAFT", subdomain: null, publishedRevisionId: null });
      expect(await prisma.siteDomain.count({ where: { siteId } })).toBe(0);
    });

    it("publishing serves the approved revision at <subdomain>.<root domain>", async () => {
      const { siteId, subdomain, host } = await publishedSite({ name: `Public ${RUN_ID}` });

      expect(subdomain).toBe(`public-${RUN_ID}`);
      const resolved = await hosts.resolveSiteByHost(host);
      expect(resolved).toMatchObject({ siteId, template: "marquee", showContact: false });
      expect(resolved!.content).toMatchObject({ name: `Public ${RUN_ID}`, headline: "Actor, Los Angeles" });
      // The Host header as a browser or a proxy may send it.
      expect(await hosts.resolveSiteByHost(`${host.toUpperCase()}:443`)).toMatchObject({ siteId });
      expect(await hosts.resolveSiteByHost(`${host}.`)).toMatchObject({ siteId });

      expect(await prisma.siteDomain.findUnique({ where: { hostname: host } })).toMatchObject({
        siteId,
        kind: "SUBDOMAIN",
        status: "ACTIVE",
      });
    });

    it("editing after the approval changes neither the approval nor what is published", async () => {
      const { siteId, host, owner } = await publishedSite({
        name: `Stable ${RUN_ID}`,
        headline: "Approved headline",
      });
      const approvedRevisionId = (await row(siteId)).approvedRevisionId;

      await actions.saveSite({
        siteId,
        template: "studio",
        content: content({ name: `Stable ${RUN_ID}`, headline: "Unapproved edit", bio: "Work in progress." }),
      });

      // The draft moved on...
      const view = await sites.getSiteForOwner(owner, siteId);
      expect(view).toMatchObject({ latestVersion: 2, approvedVersion: 1, publishedVersion: 1, template: "studio" });
      expect(view!.content).toMatchObject({ headline: "Unapproved edit" });
      // ...the approval and the public page did not.
      const site = await row(siteId);
      expect(site.approvedRevisionId).toBe(approvedRevisionId);
      expect(site.publishedRevisionId).toBe(approvedRevisionId);
      const resolved = await hosts.resolveSiteByHost(host);
      expect(resolved).toMatchObject({ template: "marquee" });
      expect(resolved!.content).toMatchObject({ headline: "Approved headline", bio: "Bilingual." });
      expect(JSON.stringify(resolved)).not.toContain("Unapproved edit");

      // Publishing again without a new approval still serves version 1.
      await actions.publishSite(siteId);
      expect((await hosts.resolveSiteByHost(host))!.content.headline).toBe("Approved headline");

      // Once the customer approves the edit and it is published, it shows.
      await actions.approveSitePreview(siteId);
      expect((await hosts.resolveSiteByHost(host))!.content.headline).toBe("Approved headline");
      await actions.publishSite(siteId);
      const after = await hosts.resolveSiteByHost(host);
      expect(after).toMatchObject({ template: "studio" });
      expect(after!.content.headline).toBe("Unapproved edit");
    });

    it("publish then unpublish toggles resolution, and the address comes back", async () => {
      const { siteId, subdomain, host } = await publishedSite({ name: `Toggle ${RUN_ID}` });
      expect(await hosts.resolveSiteByHost(host)).not.toBeNull();

      expect(await actions.unpublishSite(siteId)).toEqual({ ok: true });
      expect(await hosts.resolveSiteByHost(host)).toBeNull();
      expect(await row(siteId)).toMatchObject({ status: "DRAFT", publishedRevisionId: null, subdomain });

      expect(await actions.publishSite(siteId)).toEqual({ ok: true, subdomain });
      expect(await hosts.resolveSiteByHost(host)).toMatchObject({ siteId });

      // An operator can take it down as well.
      asOperator();
      expect(await actions.unpublishSite(siteId)).toEqual({ ok: true });
      expect(await hosts.resolveSiteByHost(host)).toBeNull();
    });

    it("contact details are removed unless the owner turned them on", async () => {
      const { siteId, host } = await publishedSite({ name: `Private ${RUN_ID}` });

      const hidden = await hosts.resolveSiteByHost(host);
      expect(hidden!.showContact).toBe(false);
      expect(hidden!.content).not.toHaveProperty("contactEmail");
      expect(JSON.stringify(hidden)).not.toContain("zed@contact.example.org");
      // The rest of the content is all there.
      expect(hidden!.content).toMatchObject({ name: `Private ${RUN_ID}`, links: [{ label: "IMDb" }] });

      expect(await actions.setSiteContactVisibility(siteId, true)).toEqual({ ok: true, showContact: true });
      const shown = await hosts.resolveSiteByHost(host);
      expect(shown).toMatchObject({ showContact: true, content: { contactEmail: "zed@contact.example.org" } });

      expect(await actions.setSiteContactVisibility(siteId, false)).toEqual({ ok: true, showContact: false });
      expect((await hosts.resolveSiteByHost(host))!.content).not.toHaveProperty("contactEmail");
    });

    it("two sites with the same name get two addresses, each serving its own site", async () => {
      const first = await publishedSite({ name: `Twin ${RUN_ID}`, headline: "First twin" });
      const other = await newSite({ name: `Twin ${RUN_ID}`, headline: "Second twin" });
      await actions.approveSitePreview(other.siteId);
      const published = await actions.publishSite(other.siteId);

      expect(published).toEqual({ ok: true, subdomain: `${first.subdomain}-2` });
      expect((await hosts.resolveSiteByHost(first.host))!.content.headline).toBe("First twin");
      expect((await hosts.resolveSiteByHost(`${first.subdomain}-2.${ROOT}`))!.content.headline).toBe("Second twin");
    });
  });

  describe("a customer's own domain", () => {
    it("serves the site only once it is verified by DNS and activated by an operator", async () => {
      const { siteId, host, owner } = await publishedSite({ name: `Domain ${RUN_ID}` });
      const custom = `www.custom-${RUN_ID}.com`;

      const added = await actions.addSiteDomain(siteId, ` WWW.Custom-${RUN_ID}.COM. `);
      if (!added.ok) throw new Error(`could not add the domain: ${added.error.key}`);
      expect(added).toMatchObject({
        hostname: custom,
        dns: {
          txtName: `_agental-verify.${custom}`,
          txtValue: expect.stringMatching(/^agental-site-verification=[0-9a-f]{32}$/),
          cnameTarget: ROOT,
        },
      });
      // PENDING: the public gets nothing on that host.
      expect(await hosts.resolveSiteByHost(custom)).toBeNull();

      // No TXT record yet.
      expect(await actions.verifySiteDomain(added.domainId)).toEqual({
        ok: false,
        error: { key: "errors.domainNotVerified" },
      });
      const checked = await prisma.siteDomain.findUniqueOrThrow({ where: { id: added.domainId } });
      expect(checked).toMatchObject({ status: "PENDING", verifiedAt: null });
      expect(checked.lastCheckedAt).toBeInstanceOf(Date);

      // An operator cannot skip the proof.
      asOperator();
      expect(await actions.activateSiteDomain(added.domainId)).toEqual({
        ok: false,
        error: { key: "errors.domainNotVerified" },
      });

      // A wrong value is not a proof either.
      as(owner);
      dns.records[added.dns.txtName] = [["agental-site-verification=00000000000000000000000000000000"]];
      expect(await actions.verifySiteDomain(added.domainId)).toMatchObject({ ok: false });

      // The customer adds the record at their registrar.
      dns.records[added.dns.txtName] = [["v=spf1 -all"], [added.dns.txtValue]];
      expect(await actions.verifySiteDomain(added.domainId)).toEqual({
        ok: true,
        domainId: added.domainId,
        hostname: custom,
        status: "VERIFIED",
      });
      // VERIFIED is not ACTIVE: still nothing served, and the customer
      // cannot activate it themselves.
      expect(await hosts.resolveSiteByHost(custom)).toBeNull();
      expect(await actions.activateSiteDomain(added.domainId)).toEqual({
        ok: false,
        error: { key: "errors.forbidden" },
      });

      // The operator attached it in the hosting dashboard, and says so.
      asOperator();
      expect(await actions.activateSiteDomain(added.domainId)).toMatchObject({ ok: true, status: "ACTIVE" });
      expect(await hosts.resolveSiteByHost(custom)).toMatchObject({ siteId });
      // The hosted subdomain keeps working next to it.
      expect(await hosts.resolveSiteByHost(host)).toMatchObject({ siteId });

      // The listing for the site's own pages.
      const listed = await domains.listSiteDomains(siteId);
      expect(listed.map((d) => [d.kind, d.hostname, d.status])).toEqual([
        ["SUBDOMAIN", host, "ACTIVE"],
        ["CUSTOM", custom, "ACTIVE"],
      ]);
      expect(listed[0].dns).toBeNull();
      expect(listed[1].dns).toEqual(added.dns);

      // An unpublished site stops resolving on its own domain too.
      as(owner);
      await actions.unpublishSite(siteId);
      expect(await hosts.resolveSiteByHost(custom)).toBeNull();
      await actions.publishSite(siteId);
      expect(await hosts.resolveSiteByHost(custom)).toMatchObject({ siteId });

      // The customer disconnects the domain: it is theirs to take away.
      expect(await actions.removeSiteDomain(added.domainId)).toEqual({ ok: true });
      expect(await hosts.resolveSiteByHost(custom)).toBeNull();
      expect(await hosts.resolveSiteByHost(host)).toMatchObject({ siteId });
    });

    it("refuses our own domains, reserved names, and the hosted subdomain as something to remove", async () => {
      const { siteId } = await publishedSite({ name: `Reserved ${RUN_ID}` });

      for (const hostname of ["agental.co", `x.${ROOT}`, "www.example.com", "intranet.local", "nope"]) {
        expect(await actions.addSiteDomain(siteId, hostname)).toEqual({
          ok: false,
          error: { key: "errors.domainInvalid" },
        });
      }

      const sub = await prisma.siteDomain.findFirstOrThrow({ where: { siteId, kind: "SUBDOMAIN" } });
      expect(await actions.removeSiteDomain(sub.id)).toEqual({ ok: false, error: { key: "errors.forbidden" } });
      expect(await prisma.siteDomain.count({ where: { id: sub.id } })).toBe(1);
    });
  });

  describe("payments are off", () => {
    it("no order can be started, and publishing never needed one", async () => {
      const { siteId, owner } = await publishedSite({ name: `Unpaid ${RUN_ID}` });

      expect(await actions.startSiteCheckout({ siteId, offer: "essential" })).toEqual({
        ok: false,
        error: { key: "errors.billingUnavailable" },
      });
      expect(await prisma.siteOrder.count({ where: { userId: { in: users } } })).toBe(0);
      expect((await sites.getSiteForOwner(owner, siteId))?.paidOrder).toBeNull();
    });
  });
});
