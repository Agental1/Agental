import { describe, expect, it, vi } from "vitest";

/**
 * The small pure pieces of the Limelight module: CSV output, hostnames,
 * custom domain rules, the DNS check with a fake resolver, and the request
 * helpers. No database and no network: `@/lib/db` is replaced by an object
 * with no methods, so a query here would fail the test.
 */

vi.mock("@/lib/db", () => ({ prisma: {} }));

const { csvCell, toCsv } = await import("@/lib/limelight/csv");
const {
  isSameOrSubdomain,
  limelightRootDomain,
  limelightSiteHost,
  normalizeHostname,
  subdomainHostname,
} = await import("@/lib/limelight/hostname");
const {
  VERIFY_TXT_LABEL,
  VERIFY_TXT_PREFIX,
  checkDomainOwnership,
  cnameTarget,
  customHostname,
  dnsRecordsFor,
  hasVerificationRecord,
  newVerificationToken,
} = await import("@/lib/limelight/domains");
const { bearerMatches, clientAddressKey, limelightKeyHash, readJsonBody } = await import(
  "@/lib/limelight/request"
);

describe("csvCell", () => {
  it("leaves plain text alone", () => {
    expect(csvCell("Ana Lee")).toBe("Ana Lee");
    expect(csvCell("Chloé Müller 李娜")).toBe("Chloé Müller 李娜");
  });

  it("quotes a cell that holds a comma, a quote or a line break (RFC 4180)", () => {
    expect(csvCell("Lee, Ana")).toBe('"Lee, Ana"');
    expect(csvCell('Ana "The Voice" Lee')).toBe('"Ana ""The Voice"" Lee"');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(csvCell("line one\r\nline two")).toBe('"line one\r\nline two"');
  });

  it.each([
    ["=HYPERLINK(\"https://evil.example\",\"click\")", "\"'=HYPERLINK(\"\"https://evil.example\"\",\"\"click\"\")\""],
    ["=1+1", "'=1+1"],
    ["+1 310 555 0142", "'+1 310 555 0142"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1:A9)", "'@SUM(A1:A9)"],
    ["\tcmd", "'\tcmd"],
    ["\rcmd", "\"'\rcmd\""],
  ])("neutralizes the formula %j", (typed, cell) => {
    expect(csvCell(typed)).toBe(cell);
  });

  it("only looks at the first character", () => {
    expect(csvCell("a=b")).toBe("a=b");
    expect(csvCell("ana+tag@example.com")).toBe("ana+tag@example.com");
    expect(csvCell("jean-luc")).toBe("jean-luc");
  });

  it("writes the values the app produces as they are", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell("")).toBe("");
    expect(csvCell(true)).toBe("true");
    expect(csvCell(false)).toBe("false");
    expect(csvCell(3)).toBe("3");
    // A number is ours, never typed by a stranger: it stays a number.
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(new Date("2026-11-19T10:00:00Z"))).toBe("2026-11-19T10:00:00.000Z");
  });
});

describe("toCsv", () => {
  it("ends every record with CRLF and separates cells with commas", () => {
    expect(
      toCsv([
        ["reference", "name", "optIn"],
        ["LL-7K2M9QXA", "Lee, Ana", true],
        ["LL-0000000A", "=cmd", null],
      ])
    ).toBe('reference,name,optIn\r\nLL-7K2M9QXA,"Lee, Ana",true\r\nLL-0000000A,\'=cmd,\r\n');
  });

  it("is empty for no rows", () => {
    expect(toCsv([])).toBe("");
  });
});

describe("normalizeHostname", () => {
  it.each([
    ["ana-lee.agental.site", "ana-lee.agental.site"],
    ["Ana-Lee.Agental.SITE", "ana-lee.agental.site"],
    ["  www.example.com  ", "www.example.com"],
    ["www.example.com:443", "www.example.com"],
    ["www.example.com.", "www.example.com"],
    ["www.example.com.:8080", "www.example.com"],
    ["xn--mller-kva.example", "xn--mller-kva.example"],
    ["localhost:3000", "localhost"],
  ])("reads %j as %j", (raw, host) => {
    expect(normalizeHostname(raw)).toBe(host);
  });

  it.each([
    "",
    "   ",
    "127.0.0.1",
    "127.0.0.1:3000",
    "[::1]",
    "[::1]:3000",
    "https://example.com",
    "example.com/path",
    "user@example.com",
    "exa mple.com",
    "*.example.com",
    "_dmarc.example.com",
    "-bad.example.com",
    "bad-.example.com",
    "example..com",
    ".example.com",
    "müller.example",
    "example.com:99999999",
    "example.com:port",
    "example.com\nx-injected: 1",
    `${"a".repeat(64)}.example.com`,
    `${"a.".repeat(130)}com`,
    null,
    undefined,
    42,
    {},
  ])("refuses %j", (raw) => {
    expect(normalizeHostname(raw)).toBeNull();
  });
});

describe("root domain and subdomain hostnames", () => {
  it("reads LIMELIGHT_ROOT_DOMAIN in normal form, and is off without it", () => {
    expect(limelightRootDomain({ LIMELIGHT_ROOT_DOMAIN: " Agental.Site. " })).toBe("agental.site");
    expect(limelightRootDomain({})).toBeNull();
    expect(limelightRootDomain({ LIMELIGHT_ROOT_DOMAIN: "" })).toBeNull();
    expect(limelightRootDomain({ LIMELIGHT_ROOT_DOMAIN: "https://agental.site" })).toBeNull();
    expect(limelightRootDomain({ LIMELIGHT_ROOT_DOMAIN: "localhost" })).toBeNull();
  });

  it("builds the hostname of a hosted subdomain only when a root domain is set", () => {
    expect(subdomainHostname("ana-lee", { LIMELIGHT_ROOT_DOMAIN: "agental.site" })).toBe("ana-lee.agental.site");
    expect(subdomainHostname("ana-lee", {})).toBeNull();
  });

  it("tells a domain and its subdomains from a lookalike", () => {
    expect(isSameOrSubdomain("agental.site", "agental.site")).toBe(true);
    expect(isSameOrSubdomain("ana.agental.site", "agental.site")).toBe(true);
    expect(isSameOrSubdomain("notagental.site", "agental.site")).toBe(false);
    expect(isSameOrSubdomain("agental.site.evil.example", "agental.site")).toBe(false);
  });
});

describe("limelightSiteHost (the proxy's question)", () => {
  const env = { LIMELIGHT_ROOT_DOMAIN: "agental.site" };

  it("is off while no root domain is set", () => {
    expect(limelightSiteHost("ana-lee.agental.site", {})).toBeNull();
    expect(limelightSiteHost("www.ana-lee.com", { LIMELIGHT_APP_HOSTS: "agental.co" })).toBeNull();
  });

  it("answers a hosted subdomain, in normal form", () => {
    expect(limelightSiteHost("Ana-Lee.agental.site:443", env)).toBe("ana-lee.agental.site");
  });

  it("never treats the root domain, a lookalike or a bad header as a site", () => {
    expect(limelightSiteHost("agental.site", env)).toBeNull();
    expect(limelightSiteHost("notagental.site", env)).toBeNull();
    expect(limelightSiteHost("127.0.0.1", env)).toBeNull();
    expect(limelightSiteHost(null, env)).toBeNull();
  });

  it("leaves customer domains to the app until the app's hosts are listed", () => {
    expect(limelightSiteHost("www.ana-lee.com", env)).toBeNull();
  });

  it("answers a customer domain once the app's hosts are listed, and never an app host", () => {
    const listed = { ...env, LIMELIGHT_APP_HOSTS: "agental.co, localhost, my-app.vercel.app" };
    expect(limelightSiteHost("www.ana-lee.com", listed)).toBe("www.ana-lee.com");
    expect(limelightSiteHost("agental.co", listed)).toBeNull();
    expect(limelightSiteHost("www.agental.co", listed)).toBeNull();
    expect(limelightSiteHost("localhost:3000", listed)).toBeNull();
    expect(limelightSiteHost("my-app.vercel.app", listed)).toBeNull();
  });
});

describe("customHostname", () => {
  const env = {
    LIMELIGHT_ROOT_DOMAIN: "agental.site",
    NEXT_PUBLIC_SITE_URL: "https://www.agental-app.example.org",
    LIMELIGHT_APP_HOSTS: "preview-host.dev",
  };

  it.each([
    ["ana-lee.com", "ana-lee.com"],
    ["WWW.Ana-Lee.COM.", "www.ana-lee.com"],
    ["portfolio.ana-lee.co.uk", "portfolio.ana-lee.co.uk"],
    ["xn--mller-kva.de", "xn--mller-kva.de"],
  ])("accepts %j as %j", (raw, host) => {
    expect(customHostname(raw, env)).toBe(host);
  });

  it.each([
    ["one of our own domains", "agental.co"],
    ["a subdomain of our own domain", "ana.agental.co"],
    ["the root domain of the hosted sites", "agental.site"],
    ["someone else's hosted subdomain", "ana-lee.agental.site"],
    ["a host the app is served from", "preview-host.dev"],
    ["a single label", "localhost"],
    ["a reserved test name", "ana.test"],
    ["a reserved example domain", "www.example.com"],
    ["a private suffix", "nas.local"],
    ["a numeric last label", "ana.123"],
    ["an IP address", "203.0.113.7"],
    ["a URL", "https://ana-lee.com"],
    ["a wildcard", "*.ana-lee.com"],
    ["an underscore label", "_agental-verify.ana-lee.com"],
    ["nothing", ""],
  ])("refuses %s", (_label, raw) => {
    expect(customHostname(raw, env)).toBeNull();
  });

  it("refuses the configured site URL's domain, with or without www", () => {
    expect(customHostname("agental-app.example.org", { NEXT_PUBLIC_SITE_URL: "https://www.agental-app.net" })).toBeNull();
    expect(customHostname("agental-app.net", { NEXT_PUBLIC_SITE_URL: "https://www.agental-app.net" })).toBeNull();
    expect(customHostname("shop.agental-app.net", { AUTH_URL: "https://agental-app.net" })).toBeNull();
  });
});

describe("DNS records and the ownership check", () => {
  it("draws an unguessable token each time", () => {
    const a = newVerificationToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newVerificationToken()).not.toBe(a);
  });

  it("names the two records a customer adds", () => {
    expect(dnsRecordsFor("www.ana-lee.com", "abc123", { LIMELIGHT_ROOT_DOMAIN: "agental.site" })).toEqual({
      txtName: "_agental-verify.www.ana-lee.com",
      txtValue: "agental-site-verification=abc123",
      cnameTarget: "agental.site",
    });
    expect(VERIFY_TXT_LABEL).toBe("_agental-verify");
    expect(VERIFY_TXT_PREFIX).toBe("agental-site-verification=");
  });

  it("prefers LIMELIGHT_CNAME_TARGET for the CNAME record", () => {
    expect(cnameTarget({ LIMELIGHT_CNAME_TARGET: "Sites.Hosting.Example.", LIMELIGHT_ROOT_DOMAIN: "agental.site" })).toBe(
      "sites.hosting.example"
    );
    expect(cnameTarget({})).toBe("agental.site");
  });

  const token = "0123456789abcdef0123456789abcdef";
  const resolverWith = (records: string[][] | Error) => ({
    resolveTxt: vi.fn(async (name: string) => {
      void name;
      if (records instanceof Error) throw records;
      return records;
    }),
  });

  it("finds the record under _agental-verify.<hostname>", async () => {
    const resolver = resolverWith([["v=spf1 -all"], [`agental-site-verification=${token}`]]);
    expect(await hasVerificationRecord("www.ana-lee.com", token, resolver)).toBe(true);
    expect(resolver.resolveTxt).toHaveBeenCalledWith("_agental-verify.www.ana-lee.com");
  });

  it("joins a record that arrives in chunks", async () => {
    const resolver = resolverWith([["agental-site-verifi", `cation=${token}`]]);
    expect(await hasVerificationRecord("ana-lee.com", token, resolver)).toBe(true);
  });

  it.each([
    ["no record at all", []],
    ["another token", [["agental-site-verification=ffffffffffffffffffffffffffffffff"]]],
    ["the token alone, without its prefix", [[token]]],
    ["the token with something appended", [[`agental-site-verification=${token}0`]]],
    ["an unrelated record", [["google-site-verification=abc"]]],
  ])("answers false for %s", async (_label, records) => {
    expect(await hasVerificationRecord("ana-lee.com", token, resolverWith(records))).toBe(false);
  });

  it("answers false when the resolver fails, instead of throwing", async () => {
    const notFound = Object.assign(new Error("queryTxt ENOTFOUND"), { code: "ENOTFOUND" });
    expect(await hasVerificationRecord("ana-lee.com", token, resolverWith(notFound))).toBe(false);
  });

  const pending = { id: "d1", hostname: "www.ana-lee.com", status: "PENDING", verificationToken: token };
  const now = new Date("2026-11-19T10:00:00Z");
  const domainDb = () => ({ siteDomain: { updateMany: vi.fn(async () => ({ count: 1 })) } });

  it("marks a pending domain VERIFIED on a match, with both dates", async () => {
    const db = domainDb();
    const resolver = resolverWith([[`agental-site-verification=${token}`]]);

    expect(await checkDomainOwnership(pending, { resolver, now, db: db as never })).toEqual({
      verified: true,
      status: "VERIFIED",
    });
    expect(db.siteDomain.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", status: { in: ["PENDING", "FAILED"] } },
      data: { status: "VERIFIED", verifiedAt: now, lastCheckedAt: now },
    });
  });

  it("only records the time of the look when the record is missing", async () => {
    const db = domainDb();

    expect(await checkDomainOwnership(pending, { resolver: resolverWith([]), now, db: db as never })).toEqual({
      verified: false,
    });
    expect(db.siteDomain.updateMany).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { lastCheckedAt: now },
    });
  });

  it.each(["VERIFIED", "ACTIVE"] as const)("answers a %s domain as it stands, with no lookup", async (status) => {
    const db = domainDb();
    const resolver = resolverWith([]);

    expect(await checkDomainOwnership({ ...pending, status }, { resolver, now, db: db as never })).toEqual({
      verified: true,
      status,
    });
    expect(resolver.resolveTxt).not.toHaveBeenCalled();
    expect(db.siteDomain.updateMany).not.toHaveBeenCalled();
  });
});

describe("request helpers", () => {
  it("hashes a value with a key from AUTH_SECRET, apart per label", () => {
    const a = limelightKeyHash("addr", "203.0.113.7", "secret-one");
    expect(a).toMatch(/^[0-9a-f]{40}$/);
    expect(a).not.toContain("203.0.113.7");
    expect(limelightKeyHash("addr", "203.0.113.7", "secret-one")).toBe(a);
    expect(limelightKeyHash("addr", "203.0.113.7", "secret-two")).not.toBe(a);
    expect(limelightKeyHash("email", "203.0.113.7", "secret-one")).not.toBe(a);
    expect(limelightKeyHash("addr", "203.0.113.8", "secret-one")).not.toBe(a);
  });

  it("keys the client by x-real-ip first, then the first forwarded hop, then one shared bucket", () => {
    vi.stubEnv("AUTH_SECRET", "test-secret-with-enough-entropy");
    const key = (headers: Record<string, string>) => clientAddressKey(new Headers(headers));
    const real = key({ "x-real-ip": "203.0.113.7" });

    expect(key({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" })).toBe(real);
    expect(key({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })).toBe(real);
    expect(key({})).toBe(key({ "x-forwarded-for": "" }));
    expect(key({})).not.toBe(real);
    vi.unstubAllEnvs();
  });

  const post = (body: BodyInit | null, headers: Record<string, string> = { "content-type": "application/json" }) =>
    new Request("https://app.test/api/limelight/interest", { method: "POST", body, headers });

  it("reads a JSON body", async () => {
    expect(await readJsonBody(post('{"name":"Ana"}'), 1024)).toEqual({ ok: true, value: { name: "Ana" } });
    expect(
      await readJsonBody(post('{"name":"Chloé"}', { "content-type": "Application/JSON; charset=utf-8" }), 1024)
    ).toEqual({ ok: true, value: { name: "Chloé" } });
  });

  it.each([
    ["a form post", "name=Ana", { "content-type": "application/x-www-form-urlencoded" }],
    ["plain text that happens to be JSON", '{"name":"Ana"}', { "content-type": "text/plain" }],
    ["no content type", '{"name":"Ana"}', {}],
    ["broken JSON", '{"name":', { "content-type": "application/json" }],
    ["an empty body", "", { "content-type": "application/json" }],
  ])("refuses %s", async (_label, body, headers) => {
    expect(await readJsonBody(post(body, headers as Record<string, string>), 1024)).toEqual({ ok: false });
  });

  it("refuses a body over the cap, whether or not its size was declared", async () => {
    const big = JSON.stringify({ name: "a".repeat(2000) });
    expect(await readJsonBody(post(big), 1024)).toEqual({ ok: false });
    expect(
      await readJsonBody(post(big, { "content-type": "application/json", "content-length": "10" }), 1024)
    ).toEqual({ ok: false });
    expect(await readJsonBody(post(JSON.stringify({ name: "a".repeat(900) })), 1024)).toMatchObject({ ok: true });
  });

  it("refuses bytes that are not UTF-8", async () => {
    expect(await readJsonBody(post(new Uint8Array([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x7d])), 1024)).toEqual({ ok: false });
  });

  it("checks the bearer token of the cron route", () => {
    const withAuth = (value?: string) => new Headers(value ? { authorization: value } : {});
    expect(bearerMatches(withAuth("Bearer s3cret-value"), "s3cret-value")).toBe(true);
    expect(bearerMatches(withAuth("bearer s3cret-value"), "s3cret-value")).toBe(true);
    expect(bearerMatches(withAuth("Bearer s3cret-valuE"), "s3cret-value")).toBe(false);
    expect(bearerMatches(withAuth("Bearer s3cret"), "s3cret-value")).toBe(false);
    expect(bearerMatches(withAuth("Bearer s3cret-value-and-more"), "s3cret-value")).toBe(false);
    expect(bearerMatches(withAuth("Basic s3cret-value"), "s3cret-value")).toBe(false);
    expect(bearerMatches(withAuth("s3cret-value"), "s3cret-value")).toBe(false);
    expect(bearerMatches(withAuth(), "s3cret-value")).toBe(false);
    expect(bearerMatches(withAuth("Bearer "), "")).toBe(false);
  });
});
