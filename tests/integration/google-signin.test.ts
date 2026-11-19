import { createHash, randomBytes } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import bcrypt from "bcryptjs";
import { decode, encode } from "next-auth/jwt";
import type { PrismaClient } from "@/generated/prisma/client";
import { authErrorKey } from "@/domain/auth-errors";
import { verifyCookieValue } from "@/lib/auth/signed-cookie";
import { Browser, ORIGIN, type AppRouter } from "./helpers/browser";
import {
  FakeGoogle,
  GOOGLE_AUTHORIZATION_ENDPOINT,
  type GooglePerson,
  type TokenFault,
} from "./helpers/fake-google";

/**
 * Google sign-in, our side of the wire, from the "Continue with Google" button
 * to a working session.
 *
 * Real in this test:
 * - the app's server actions (oauthSignInAction, completePendingOAuthAction,
 *   loginAction, logoutAction);
 * - the Auth.js route handlers exported by src/app/api/auth/[...nextauth] and
 *   the session reset route, called with Request objects;
 * - src/auth.ts with its signIn, jwt and session callbacks, the signed intent
 *   and pending cookies, and resolve-oauth-user.ts;
 * - the database: every user, account and audit row is written to Postgres,
 *   so unique constraints and transactions are the real ones.
 *
 * Replaced:
 * - Google, by tests/integration/helpers/fake-google.ts (consent screen,
 *   discovery document, keys, token endpoint). Every request stays inside the
 *   test process.
 * - the browser and the Next.js request plumbing (`next/headers`, the cookie
 *   round trip of a server action), by tests/integration/helpers/browser.ts.
 * - `@/i18n/navigation`: next-intl does not load under Vitest with this
 *   repository's configuration. The stand-in below builds the same
 *   locale-prefixed address and throws Next's own redirect. It is only reached
 *   on refusal paths inside the two OAuth server actions.
 *
 * Out of reach here, listed in docs/GOOGLE_SIGNIN_TESTS.md: the pages
 * themselves (/connexion, /continuer), src/proxy.ts, and anything only a real
 * browser and the real Google can show.
 *
 * Needs DATABASE_URL pointing at a local Postgres. Skipped otherwise, so the
 * unit suite stays runnable anywhere and this file can never write test rows
 * to a hosted database.
 */

vi.mock("next/headers", async () => {
  const { nextHeadersStandIn } = await import("./helpers/browser");
  return nextHeadersStandIn;
});

vi.mock("@/i18n/navigation", async () => {
  const { redirect } = await import("next/navigation");
  type Href = string | { pathname: string; query?: Record<string, string> };
  return {
    redirect: ({ href, locale }: { href: Href; locale: string }) => {
      const path =
        typeof href === "string"
          ? href
          : href.pathname + (href.query ? `?${new URLSearchParams(href.query)}` : "");
      return redirect(`/${locale}${path}`);
    },
  };
});

// ───────────────────────────── environment ──────────────────────────────

const PREFIX = "test-google-flow-";
const RUN = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

const CLIENT_ID = "test-google-flow.apps.googleusercontent.com";
// Dummy values made up for each run, with no real credential among them.
const CLIENT_SECRET = `dummy-${randomBytes(18).toString("base64url")}`;
const AUTH_SECRET = randomBytes(32).toString("base64url");

const touchedEnv = [
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_SECRET",
  "AUTH_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "AUTH_REDIRECT_PROXY_URL",
  "AUTH_APPLE_ID",
  "AUTH_APPLE_SECRET",
  "AUTH_APPLE_TEAM_ID",
  "AUTH_APPLE_KEY_ID",
  "AUTH_APPLE_PRIVATE_KEY",
  "DATABASE_POOL_MAX",
] as const;
const savedEnv = new Map(touchedEnv.map((name) => [name, process.env[name]]));
for (const name of touchedEnv) delete process.env[name];
process.env.AUTH_GOOGLE_ID = CLIENT_ID;
process.env.AUTH_GOOGLE_SECRET = CLIENT_SECRET;
process.env.AUTH_SECRET = AUTH_SECRET;
process.env.AUTH_URL = ORIGIN;
// The local test database answers one query at a time.
process.env.DATABASE_POOL_MAX = savedEnv.get("DATABASE_POOL_MAX") ?? "1";

function databaseIsLocal(): boolean {
  try {
    const { hostname } = new URL(process.env.DATABASE_URL ?? "");
    return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  } catch {
    return false;
  }
}

// ─────────────────────────────── constants ───────────────────────────────

const CALLBACK = `${ORIGIN}/api/auth/callback/google`;
/** The two redirect URIs docs/OAUTH_SETUP.md says to register with Google. */
const REGISTERED_REDIRECT_URIS = [
  "https://www.agental.co/api/auth/callback/google",
  "http://localhost:3000/api/auth/callback/google",
];

// Cookie names on http. On https Auth.js adds a __Secure- prefix.
const SESSION_COOKIE = "authjs.session-token";
const STATE_COOKIE = "authjs.state";
const PKCE_COOKIE = "authjs.pkce.code_verifier";
const NONCE_COOKIE = "authjs.nonce";
const CALLBACK_URL_COOKIE = "authjs.callback-url";
const CSRF_COOKIE = "authjs.csrf-token";
const INTENT_COOKIE = "agental.oauth-intent";
const PENDING_COOKIE = "agental.pending-oauth";

type Start = {
  /** The page the button is on. */
  page: string;
  mode: "signin" | "signup";
  kind?: "TALENT" | "CASTING";
  locale: string;
};
const TALENT_SIGNUP_PAGE: Start = {
  page: "/en/talents/inscription",
  mode: "signup",
  kind: "TALENT",
  locale: "en",
};
const SIGN_IN_PAGE: Start = { page: "/en/connexion", mode: "signin", locale: "en" };

interface SessionBody {
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    kind?: string;
    locale?: string;
  };
  expires: string;
}

// ──────────────────────────────── the suite ───────────────────────────────

describe.skipIf(!databaseIsLocal())(
  "Google sign-in, our side of the wire (fake Google, real handlers, real database)",
  () => {
    let prisma: PrismaClient;
    let google: FakeGoogle;
    let app: AppRouter;
    let oauthSignInAction: (form: FormData) => Promise<void>;
    let completePendingOAuthAction: (form: FormData) => Promise<void>;
    let consoleError: MockInstance<typeof console.error>;
    let personCount = 0;

    beforeAll(async () => {
      google = await FakeGoogle.create({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        redirectUris: REGISTERED_REDIRECT_URIS,
      });
      vi.stubGlobal("fetch", google.fetch);

      ({ prisma } = await import("@/lib/db"));
      const authRoute = await import("@/app/api/auth/[...nextauth]/route");
      const resetRoute = await import("@/app/api/session/reset/route");
      ({ oauthSignInAction, completePendingOAuthAction } = await import(
        "@/app/actions/oauth"
      ));

      app = async (request) => {
        const { pathname } = request.nextUrl;
        if (pathname.startsWith("/api/auth/")) {
          return request.method === "POST" ? authRoute.POST(request) : authRoute.GET(request);
        }
        if (pathname === "/api/session/reset") return resetRoute.GET(request);
        throw new Error(`No handler is wired into this test for ${pathname}.`);
      };

      await removeTestRows();
    });

    afterAll(async () => {
      await removeTestRows();
      vi.unstubAllGlobals();
      for (const [name, value] of savedEnv) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    });

    // Auth.js reports every refused sign-in on console.error. The spy keeps
    // the output readable and lets a test assert that the server logged the
    // refusal while the visitor only saw a short code.
    beforeEach(() => {
      consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
      consoleError.mockRestore();
    });

    // ───────────────────────────── helpers ──────────────────────────────

    /** Rows are removed by prefix, so a crashed run is cleaned by the next. */
    async function removeTestRows() {
      const users = await prisma.user.findMany({
        where: { email: { startsWith: PREFIX, mode: "insensitive" } },
        select: { id: true },
      });
      const ids = users.map((user) => user.id);
      // Audit entries survive their actor (SetNull), so they go first.
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actorUserId: { in: ids } },
            { resourceType: "User", resourceId: { in: ids } },
          ],
        },
      });
      await prisma.account.deleteMany({
        where: { providerAccountId: { startsWith: PREFIX } },
      });
      // Accounts, profiles and mandates go with their user.
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }

    function uniqueId(label: string): string {
      personCount += 1;
      return `${RUN}-${personCount}-${label}`;
    }

    /** A Google account nobody has seen before. */
    function person(label: string, overrides: Partial<GooglePerson> = {}): GooglePerson {
      const id = uniqueId(label);
      return {
        sub: `${PREFIX}sub-${id}`,
        email: `${PREFIX}${id}@gmail.com`,
        name: `Test ${label}`,
        picture: "https://lh3.googleusercontent.com/a/test-google-flow",
        ...overrides,
      };
    }

    function newBrowser(): Browser {
      return new Browser(app);
    }

    /** Press "Continue with Google". Returns where the browser is sent. */
    async function pressContinueWithGoogle(
      browser: Browser,
      start: Start,
      extraFields: Record<string, string> = {}
    ): Promise<string> {
      // The fields of the form in src/components/auth/oauth-buttons.tsx.
      const form = new FormData();
      form.set("provider", "google");
      form.set("mode", start.mode);
      if (start.kind) form.set("kind", start.kind);
      form.set("locale", start.locale);
      for (const [name, value] of Object.entries(extraFields)) form.set(name, value);
      const { redirect } = await browser.submit(start.page, () => oauthSignInAction(form));
      if (!redirect) throw new Error("The sign-in action did not redirect.");
      return redirect;
    }

    /** The whole round trip: the button, Google's consent, back to the app. */
    async function signInWithGoogle(
      browser: Browser,
      who: GooglePerson,
      start: Start,
      options: { fault?: TokenFault } = {}
    ): Promise<Response> {
      const authorizationUrl = await pressContinueWithGoogle(browser, start);
      const returnLink = google.consent(authorizationUrl, who, options);
      return browser.visit(returnLink, { crossSite: true });
    }

    /** A talent who already signed up with Google, from another browser. */
    async function existingGoogleTalent(label: string): Promise<GooglePerson> {
      const who = person(label);
      const response = await signInWithGoogle(newBrowser(), who, TALENT_SIGNUP_PAGE);
      expect(locationOf(response).pathname).toBe("/en/continuer");
      return who;
    }

    /** An account made with email and password, its email never proven. */
    async function createPasswordAccount(label: string, domain = "gmail.com") {
      const email = `${PREFIX}${uniqueId(label)}@${domain}`;
      const password = `Aa!${randomBytes(12).toString("base64url")}`;
      const user = await prisma.user.create({
        data: {
          email,
          name: `Test ${label}`,
          kind: "TALENT",
          locale: "en",
          passwordHash: await bcrypt.hash(password, 4),
        },
      });
      return { user, email, password };
    }

    /** The app's own email and password form on /connexion. */
    async function signInWithPassword(browser: Browser, email: string, password: string) {
      const { loginAction } = await import("@/app/actions/auth");
      const form = new FormData();
      form.set("email", email);
      form.set("password", password);
      form.set("locale", "en");
      return browser.submit("/en/connexion", () => loginAction(undefined, form));
    }

    async function sessionOf(browser: Browser): Promise<SessionBody | null> {
      const response = await browser.visit("/api/auth/session");
      expect(response.status).toBe(200);
      return (await response.json()) as SessionBody | null;
    }

    function locationOf(response: Response): URL {
      expect([302, 303, 307]).toContain(response.status);
      const location = response.headers.get("location");
      expect(location).toBeTruthy();
      return new URL(location!, ORIGIN);
    }

    async function rowsFor(who: Pick<GooglePerson, "email" | "sub">) {
      const users = await prisma.user.findMany({
        where: { email: { equals: who.email.toLowerCase(), mode: "insensitive" } },
      });
      const accounts = await prisma.account.findMany({
        where: { provider: "google", providerAccountId: who.sub },
      });
      return { users, accounts };
    }

    async function expectNothingCreated(who: Pick<GooglePerson, "email" | "sub">) {
      const { users, accounts } = await rowsFor(who);
      expect(users).toHaveLength(0);
      expect(accounts).toHaveLength(0);
    }

    /**
     * A refusal seen from the browser: a redirect to our own sign-in page
     * carrying a short code, an empty body, and no session.
     */
    async function expectRefusal(
      response: Response,
      browser: Browser,
      expected: { path: string; code: string; message?: string }
    ) {
      const location = locationOf(response);
      expect(location.origin).toBe(ORIGIN);
      expect(location.pathname).toBe(expected.path);
      expect(location.searchParams.get("error")).toBe(expected.code);
      expect([...location.searchParams.keys()]).toEqual(["error"]);
      // The page turns the code into a translated message; an unknown code
      // becomes the generic one, so the page shows only its own wording.
      expect(authErrorKey(expected.code)).toBe(expected.message ?? "errors.oauthGeneric");
      // The body of a redirect is empty: it carries no stack trace or error text.
      expect(await response.text()).toBe("");
      expect(browser.cookie(SESSION_COOKIE)).toBeUndefined();
    }

    function sha256(value: string): string {
      return createHash("sha256").update(value).digest("base64url");
    }

    async function unsealed(browser: Browser, cookieName: string): Promise<unknown> {
      const cookie = browser.cookie(cookieName);
      if (!cookie) return undefined;
      const payload = await decode({ token: cookie.value, secret: AUTH_SECRET, salt: cookieName });
      return payload?.value;
    }

    // ───────────────────────── leaving for Google ─────────────────────────

    describe("leaving for Google", () => {
      it("1. pressing Continue with Google sends the person to Google with our return address, the three basic scopes, and state plus PKCE protection", async () => {
        const browser = newBrowser();
        const target = await pressContinueWithGoogle(browser, TALENT_SIGNUP_PAGE);

        const url = new URL(target);
        expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTHORIZATION_ENDPOINT);
        const query = url.searchParams;
        // The complete list, so a new parameter is noticed.
        expect([...query.keys()].sort()).toEqual([
          "client_id",
          "code_challenge",
          "code_challenge_method",
          "prompt",
          "redirect_uri",
          "response_type",
          "scope",
          "state",
        ]);
        expect(query.get("response_type")).toBe("code");
        expect(query.get("client_id")).toBe(CLIENT_ID);
        expect(query.get("redirect_uri")).toBe(CALLBACK);
        expect(REGISTERED_REDIRECT_URIS).toContain(query.get("redirect_uri"));
        // Auth.js writes them in this order; Google reads them as a set.
        expect(query.get("scope")).toBe("openid profile email");
        expect(query.get("scope")!.split(" ").sort()).toEqual(["email", "openid", "profile"]);
        expect(query.get("prompt")).toBe("select_account");
        expect(target).not.toContain(CLIENT_SECRET);

        // Anti-forgery values really present for this provider: state and
        // PKCE (S256). A nonce is absent from the URL and from the cookies.
        expect(query.get("state")!.length).toBeGreaterThan(40);
        expect(query.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(query.get("code_challenge_method")).toBe("S256");
        expect(query.has("nonce")).toBe(false);
        expect(browser.cookie(NONCE_COOKIE)).toBeUndefined();

        for (const name of [STATE_COOKIE, PKCE_COOKIE, CALLBACK_URL_COOKIE, INTENT_COOKIE]) {
          const cookie = browser.cookie(name);
          expect(cookie, name).toBeDefined();
          expect(cookie!.httpOnly, `${name} HttpOnly`).toBe(true);
          expect(cookie!.sameSite, `${name} SameSite`).toBe("lax");
        }
        // The state cookie holds, sealed, the state sent to Google.
        expect(await unsealed(browser, STATE_COOKIE)).toBe(query.get("state"));
        // The PKCE cookie holds, sealed, the secret whose hash went to Google.
        const verifier = await unsealed(browser, PKCE_COOKIE);
        expect(typeof verifier).toBe("string");
        expect(sha256(verifier as string)).toBe(query.get("code_challenge"));
        expect(target).not.toContain(verifier as string);
        expect(browser.cookie(PKCE_COOKIE)!.value).not.toContain(verifier as string);

        // Where Auth.js will send the person after the callback.
        expect(browser.cookie(CALLBACK_URL_COOKIE)!.value).toBe(`${ORIGIN}/en/continuer`);
        // What the person asked for, signed, readable only by /api/auth.
        const intent = browser.cookie(INTENT_COOKIE)!;
        expect(intent.path).toBe("/api/auth");
        expect(await verifyCookieValue("oauth-intent", intent.value)).toEqual({
          mode: "signup",
          kind: "TALENT",
          locale: "en",
        });
        expect(browser.cookie(SESSION_COOKIE)).toBeUndefined();
        expect(consoleError).not.toHaveBeenCalled();
      });

      it("15. a provider this deployment has not configured is refused before anything is sent or stored", async () => {
        const browser = newBrowser();
        const discoveryBefore = google.requests.discovery;
        const form = new FormData();
        form.set("provider", "apple");
        form.set("mode", "signin");
        form.set("locale", "fr");
        const { redirect } = await browser.submit("/fr/connexion", () => oauthSignInAction(form));
        expect(redirect).toBe("/fr/connexion?error=oauthGeneric");
        expect(browser.cookieNames()).toEqual([]);
        expect(google.requests.discovery).toBe(discoveryBefore);
      });

      it("16. a form posted from another website to the raw sign-in address starts nothing", async () => {
        const browser = newBrowser();
        // The visitor has been on our site: the anti-forgery cookie exists.
        await browser.visit("/api/auth/csrf");
        expect(browser.cookie(CSRF_COOKIE)?.httpOnly).toBe(true);

        const response = await browser.visit("/api/auth/signin/google", {
          method: "POST",
          form: { callbackUrl: "https://evil.example/" },
          crossSite: true,
        });
        const location = locationOf(response);
        expect(location.origin).toBe(ORIGIN);
        expect(location.pathname).toBe("/connexion");
        expect(location.searchParams.get("error")).toBe("MissingCSRF");
        expect(browser.cookie(STATE_COOKIE)).toBeUndefined();
        expect(browser.cookie(PKCE_COOKIE)).toBeUndefined();
      });
    });

    // ───────────────────────────── new people ─────────────────────────────

    describe("coming back from Google as someone new", () => {
      it("2. from the talent signup page: one talent account with a verified email and no password, one Google link, an audit entry, and a working session", async () => {
        const browser = newBrowser();
        const who = person("new-talent");
        const tokenRequestsBefore = google.requests.token.length;

        const response = await signInWithGoogle(browser, who, {
          page: "/fr/talents/inscription",
          mode: "signup",
          kind: "TALENT",
          locale: "fr",
        });

        // Back on our site, on the page that routes every sign-in.
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe(`${ORIGIN}/fr/continuer`);

        // The app exchanged the code once, the way Google requires.
        const exchanges = google.requests.token.slice(tokenRequestsBefore);
        expect(exchanges).toEqual([
          {
            grantType: "authorization_code",
            redirectUri: CALLBACK,
            hadCodeVerifier: true,
            clientAuthenticated: true,
            status: 200,
            error: null,
          },
        ]);

        const { users, accounts } = await rowsFor(who);
        expect(users).toHaveLength(1);
        const user = users[0];
        expect(user.email).toBe(who.email);
        expect(user.kind).toBe("TALENT");
        expect(user.locale).toBe("fr");
        expect(user.name).toBe(who.name);
        expect(user.image).toBe(who.picture);
        expect(user.emailVerified).toBeInstanceOf(Date);
        expect(user.passwordHash).toBeNull();
        expect(user.sessionsValidAfter).toBeNull();

        expect(accounts).toHaveLength(1);
        const account = accounts[0];
        expect(account.userId).toBe(user.id);
        expect(account.provider).toBe("google");
        expect(account.providerAccountId).toBe(who.sub);
        expect(account.type).toBe("oidc");
        expect(account.lastUsedAt).toBeInstanceOf(Date);
        // Google's tokens are dropped after sign-in: none is stored.
        expect(account.access_token).toBeNull();
        expect(account.id_token).toBeNull();
        expect(account.refresh_token).toBeNull();

        const audit = await prisma.auditLog.findMany({ where: { actorUserId: user.id } });
        expect(audit).toHaveLength(1);
        expect(audit[0].action).toBe("user.signup");
        expect(audit[0].resourceType).toBe("User");
        expect(audit[0].resourceId).toBe(user.id);
        expect(JSON.parse(audit[0].after)).toEqual({ kind: "TALENT", method: "google" });

        // The session cookie is there, the one-time cookies are gone.
        const sessionCookie = browser.cookie(SESSION_COOKIE);
        expect(sessionCookie).toBeDefined();
        expect(sessionCookie!.httpOnly).toBe(true);
        expect(sessionCookie!.sameSite).toBe("lax");
        expect(sessionCookie!.path).toBe("/");
        expect(browser.cookie(STATE_COOKIE)).toBeUndefined();
        expect(browser.cookie(PKCE_COOKIE)).toBeUndefined();
        expect(browser.cookie(INTENT_COOKIE)).toBeUndefined();
        expect(browser.cookie(PENDING_COOKIE)).toBeUndefined();

        // And the session endpoint answers with that user.
        const session = await sessionOf(browser);
        expect(session?.user).toEqual({
          id: user.id,
          email: who.email,
          name: who.name,
          image: who.picture,
          kind: "TALENT",
          locale: "fr",
        });
        const fourWeeks = 28 * 24 * 60 * 60 * 1000;
        expect(new Date(session!.expires).getTime()).toBeGreaterThan(Date.now() + fourWeeks);
        expect(consoleError).not.toHaveBeenCalled();
      });

      it("3. the same person signing in again, on another device, lands on the same account and the last-used date moves", async () => {
        const who = person("returning");
        const first = newBrowser();
        await signInWithGoogle(first, who, TALENT_SIGNUP_PAGE);
        const before = await rowsFor(who);
        expect(before.users).toHaveLength(1);
        expect(before.accounts).toHaveLength(1);
        await new Promise((resolve) => setTimeout(resolve, 20));

        const second = newBrowser();
        const response = await signInWithGoogle(second, who, SIGN_IN_PAGE);
        expect(response.headers.get("location")).toBe(`${ORIGIN}/en/continuer`);

        const after = await rowsFor(who);
        expect(after.users).toHaveLength(1);
        expect(after.accounts).toHaveLength(1);
        expect(after.users[0].id).toBe(before.users[0].id);
        expect(after.accounts[0].id).toBe(before.accounts[0].id);
        expect(after.accounts[0].lastUsedAt!.getTime()).toBeGreaterThan(
          before.accounts[0].lastUsedAt!.getTime()
        );
        // Signing in again is not a signup: still one audit entry.
        expect(
          await prisma.auditLog.count({ where: { actorUserId: before.users[0].id } })
        ).toBe(1);

        expect((await sessionOf(second))?.user.id).toBe(before.users[0].id);
        expect((await sessionOf(first))?.user.id).toBe(before.users[0].id);
        expect(consoleError).not.toHaveBeenCalled();
      });

      it("11a. from the sign-in page, with no account yet: no account is created, the identity is parked in a signed cookie, and the person is asked talent or casting director", async () => {
        const browser = newBrowser();
        const who = person("undecided");

        const response = await signInWithGoogle(browser, who, SIGN_IN_PAGE);

        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe(`${ORIGIN}/en/continuer?choose=1`);
        await expectNothingCreated(who);
        expect(browser.cookie(SESSION_COOKIE)).toBeUndefined();
        expect(await sessionOf(browser)).toBeNull();

        const pending = browser.cookie(PENDING_COOKIE);
        expect(pending).toBeDefined();
        expect(pending!.httpOnly).toBe(true);
        expect(pending!.path).toBe("/");
        expect(pending!.sameSite).toBe("lax");
        // Ten minutes to choose.
        expect(pending!.expiresAt! - Date.now()).toBeLessThanOrEqual(600_000);
        expect(pending!.expiresAt! - Date.now()).toBeGreaterThan(540_000);
        expect(await verifyCookieValue("pending-oauth", pending!.value)).toEqual({
          provider: "google",
          sub: who.sub,
          email: who.email,
          name: who.name,
          image: who.picture,
        });
        // Signed: one changed character and the value is worth nothing.
        const [body, signature] = pending!.value.split(".");
        const flipped = (body[0] === "A" ? "B" : "A") + body.slice(1);
        expect(await verifyCookieValue("pending-oauth", `${flipped}.${signature}`)).toBeNull();
        // Signed for this one use: it does not pass as an intent cookie.
        expect(await verifyCookieValue("oauth-intent", pending!.value)).toBeNull();
        expect(consoleError).not.toHaveBeenCalled();
      });

      it("11b. choosing casting director then creates the account, and a second short trip to Google opens the session", async () => {
        const browser = newBrowser();
        const who = person("chooses-casting");
        await signInWithGoogle(browser, who, SIGN_IN_PAGE);
        await expectNothingCreated(who);

        const form = new FormData();
        form.set("kind", "CASTING");
        form.set("locale", "en");
        const { redirect } = await browser.submit("/en/continuer?choose=1", () =>
          completePendingOAuthAction(form)
        );

        // The account exists now, and the parked identity is used up.
        const { users, accounts } = await rowsFor(who);
        expect(users).toHaveLength(1);
        expect(accounts).toHaveLength(1);
        expect(users[0].kind).toBe("CASTING");
        expect(users[0].emailVerified).toBeInstanceOf(Date);
        expect(users[0].passwordHash).toBeNull();
        expect(browser.cookie(PENDING_COOKIE)).toBeUndefined();
        expect(browser.cookie(SESSION_COOKIE)).toBeUndefined();
        const audit = await prisma.auditLog.findMany({ where: { actorUserId: users[0].id } });
        expect(audit.map((entry) => entry.action)).toEqual(["user.signup"]);
        expect(JSON.parse(audit[0].after)).toEqual({ kind: "CASTING", method: "google" });

        // Auth.js cannot open a session without a provider round trip.
        expect(redirect).toBeTruthy();
        expect(redirect!.startsWith(`${GOOGLE_AUTHORIZATION_ENDPOINT}?`)).toBe(true);
        const response = await browser.visit(google.consent(redirect!, who), { crossSite: true });
        expect(response.headers.get("location")).toBe(`${ORIGIN}/en/continuer`);

        const session = await sessionOf(browser);
        expect(session?.user.id).toBe(users[0].id);
        expect(session?.user.kind).toBe("CASTING");
        const after = await rowsFor(who);
        expect(after.users).toHaveLength(1);
        expect(after.accounts).toHaveLength(1);
        expect(consoleError).not.toHaveBeenCalled();
      });

      it("11c. a parked identity edited by hand is refused and creates nothing", async () => {
        const browser = newBrowser();
        const who = person("edits-cookie");
        const target = person("someone-else");
        await signInWithGoogle(browser, who, SIGN_IN_PAGE);

        // Swap the email inside the cookie and keep the old signature.
        const [body, signature] = browser.cookie(PENDING_COOKIE)!.value.split(".");
        const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
        const forged = Buffer.from(JSON.stringify({ ...payload, email: target.email })).toString(
          "base64url"
        );
        browser.editCookie(PENDING_COOKIE, `${forged}.${signature}`);

        const form = new FormData();
        form.set("kind", "TALENT");
        form.set("locale", "en");
        const { redirect } = await browser.submit("/en/continuer?choose=1", () =>
          completePendingOAuthAction(form)
        );

        expect(redirect).toBe("/en/connexion?error=oauthNoAccount");
        await expectNothingCreated(who);
        await expectNothingCreated(target);
        expect(browser.cookie(SESSION_COOKIE)).toBeUndefined();
      });

      it("11d. a parked identity never joins an account that took the same email in the meantime", async () => {
        const browser = newBrowser();
        const who = person("slow-to-choose");
        await signInWithGoogle(browser, who, SIGN_IN_PAGE);

        // While the choice screen is open, someone signs up with that email.
        const taken = await prisma.user.create({
          data: { email: who.email, kind: "TALENT", locale: "en", passwordHash: "not-a-real-hash" },
        });

        const form = new FormData();
        form.set("kind", "TALENT");
        form.set("locale", "en");
        const { redirect } = await browser.submit("/en/continuer?choose=1", () =>
          completePendingOAuthAction(form)
        );

        expect(redirect).toBe("/en/connexion?error=oauthLinkRequiresPassword");
        const { users, accounts } = await rowsFor(who);
        expect(users).toHaveLength(1);
        expect(users[0].id).toBe(taken.id);
        expect(users[0].passwordHash).toBe("not-a-real-hash");
        expect(accounts).toHaveLength(0);
        expect(browser.cookie(PENDING_COOKIE)).toBeUndefined();
        expect(browser.cookie(SESSION_COOKIE)).toBeUndefined();
      });

      it("11e. an intent cookie edited by hand is ignored: the person is asked to choose instead of getting the account type they wrote in", async () => {
        const browser = newBrowser();
        const who = person("edits-intent");
        const authorizationUrl = await pressContinueWithGoogle(browser, SIGN_IN_PAGE);

        const [, signature] = browser.cookie(INTENT_COOKIE)!.value.split(".");
        const forged = Buffer.from(
          JSON.stringify({
            mode: "signup",
            kind: "CASTING",
            locale: "en",
            exp: Math.floor(Date.now() / 1000) + 600,
          })
        ).toString("base64url");
        browser.editCookie(INTENT_COOKIE, `${forged}.${signature}`);

        const response = await browser.visit(google.consent(authorizationUrl, who), {
          crossSite: true,
        });
        expect(response.headers.get("location")).toBe(`${ORIGIN}/en/continuer?choose=1`);
        await expectNothingCreated(who);
        expect(browser.cookie(SESSION_COOKIE)).toBeUndefined();
      });
    });

    // ───────────────────── an email that already has an account ─────────────────────

    describe("coming back from Google with an email that already has an account", () => {
      it("7. a Gmail address with an existing password account lands on that same account: no second account, password removed, earlier sessions cut off, mandate set aside, all audited", async () => {
        const existing = await createPasswordAccount("has-password");
        const profile = await prisma.artistProfile.create({
          data: { userId: existing.user.id, stageName: `${PREFIX}stage` },
        });
        await prisma.mandat.create({
          data: { profileId: profile.id, status: "ACTIVE", signedAt: new Date() },
        });
        // Google reports the address in another letter case.
        const who = person("owner", { email: existing.email.replace("@gmail.com", "@GMAIL.com").replace("test-", "Test-") });
        const startedAt = Date.now();

        const browser = newBrowser();
        const response = await signInWithGoogle(browser, who, SIGN_IN_PAGE);
        expect(response.headers.get("location")).toBe(`${ORIGIN}/en/continuer`);

        const { users, accounts } = await rowsFor(who);
        expect(users).toHaveLength(1);
        const user = users[0];
        expect(user.id).toBe(existing.user.id);
        expect(user.email).toBe(existing.email);
        expect(user.passwordHash).toBeNull();
        expect(user.emailVerified).toBeInstanceOf(Date);
        expect(user.sessionsValidAfter).toBeInstanceOf(Date);
        expect(user.sessionsValidAfter!.getTime()).toBeGreaterThanOrEqual(startedAt);
        expect(user.sessionsValidAfter!.getTime()).toBeLessThanOrEqual(Date.now());
        // The name the person chose at signup is kept; the photo was empty.
        expect(user.name).toBe(existing.user.name);
        expect(user.image).toBe(who.picture);

        expect(accounts).toHaveLength(1);
        expect(accounts[0].userId).toBe(existing.user.id);

        const audit = await prisma.auditLog.findMany({ where: { actorUserId: user.id } });
        expect(audit).toHaveLength(1);
        expect(audit[0].action).toBe("auth.oauth.link_takeover");
        expect(audit[0].resourceId).toBe(user.id);
        expect(JSON.parse(audit[0].before)).toEqual({ hadPassword: true, proven: false });
        expect(JSON.parse(audit[0].after)).toEqual({
          provider: "google",
          passwordRemoved: true,
          mandatesRevoked: 1,
        });

        const mandate = await prisma.mandat.findUniqueOrThrow({ where: { profileId: profile.id } });
        expect(mandate.status).toBe("REVOKED");
        expect(mandate.revokedAt).toBeInstanceOf(Date);

        // The session opened by this very sign-in is not cut off by it.
        expect((await sessionOf(browser))?.user.id).toBe(existing.user.id);

        // The old password no longer opens the account.
        const retry = newBrowser();
        const outcome = await signInWithPassword(retry, existing.email, existing.password);
        expect(outcome.redirect).toBeNull();
        expect(outcome.result).toEqual({ error: { key: "errors.badCredentials" } });
        expect(retry.cookie(SESSION_COOKIE)).toBeUndefined();
      });

      it("13. a session opened before the takeover is refused on its next request, and its cookie is removed", async () => {
        const existing = await createPasswordAccount("earlier-session");
        // Whoever knew the password is signed in on another device.
        const earlier = newBrowser();
        const login = await signInWithPassword(earlier, existing.email, existing.password);
        expect(login.redirect).toBe(`${ORIGIN}/en/continuer`);
        expect((await sessionOf(earlier))?.user.id).toBe(existing.user.id);
        const stale = earlier.clone();
        expect(consoleError).not.toHaveBeenCalled();

        // The owner of the mailbox arrives with Google.
        const owner = newBrowser();
        await signInWithGoogle(owner, person("owner", { email: existing.email }), SIGN_IN_PAGE);
        const user = await prisma.user.findUniqueOrThrow({ where: { id: existing.user.id } });
        expect(user.sessionsValidAfter).toBeInstanceOf(Date);

        // The earlier device still holds its cookie; the server refuses it.
        expect(earlier.cookie(SESSION_COOKIE)).toBeDefined();
        expect(await sessionOf(earlier)).toBeNull();
        expect(earlier.cookie(SESSION_COOKIE)).toBeUndefined();
        // The owner's own session stands.
        expect((await sessionOf(owner))?.user.id).toBe(existing.user.id);

        // The route /continuer sends such a visitor to: cookie cleared, back
        // to the sign-in page in their language.
        expect(stale.cookie(SESSION_COOKIE)).toBeDefined();
        const reset = await stale.visit("/api/session/reset?locale=fr");
        expect(reset.status).toBe(303);
        expect(reset.headers.get("location")).toBe(`${ORIGIN}/fr/connexion`);
        expect(stale.cookie(SESSION_COOKIE)).toBeUndefined();
      });

      it("8. Google vouching for an address it is not the authority for (a yahoo.com address) is refused, and the existing account is left untouched", async () => {
        const existing = await createPasswordAccount("yahoo-owner", "yahoo.com");
        const who = person("yahoo-on-google", { email: existing.email });

        const browser = newBrowser();
        const response = await signInWithGoogle(browser, who, {
          page: "/es/connexion",
          mode: "signin",
          locale: "es",
        });

        await expectRefusal(response, browser, {
          path: "/es/connexion",
          code: "oauthLinkRequiresPassword",
          message: "errors.oauthLinkRequiresPassword",
        });
        const { users, accounts } = await rowsFor(who);
        expect(users).toHaveLength(1);
        expect(accounts).toHaveLength(0);
        expect(users[0].id).toBe(existing.user.id);
        expect(users[0].passwordHash).toBe(existing.user.passwordHash);
        expect(users[0].sessionsValidAfter).toBeNull();
        expect(users[0].emailVerified).toBeNull();
        expect(users[0].updatedAt.getTime()).toBe(existing.user.updatedAt.getTime());
        expect(await prisma.auditLog.count({ where: { actorUserId: existing.user.id } })).toBe(0);
        expect(browser.cookie(PENDING_COOKIE)).toBeUndefined();
        expect(browser.cookie(INTENT_COOKIE)).toBeUndefined();

        // The password still works.
        const retry = newBrowser();
        const outcome = await signInWithPassword(retry, existing.email, existing.password);
        expect(outcome.redirect).toBe(`${ORIGIN}/en/continuer`);
      });

      it("17. a Google Workspace address (Google names the organization in the token) joins the existing account like a Gmail address does", async () => {
        const existing = await createPasswordAccount("workspace", "studio.example");
        const who = person("workspace-owner", { email: existing.email, hd: "studio.example" });

        const browser = newBrowser();
        const response = await signInWithGoogle(browser, who, SIGN_IN_PAGE);

        expect(response.headers.get("location")).toBe(`${ORIGIN}/en/continuer`);
        const { users, accounts } = await rowsFor(who);
        expect(users).toHaveLength(1);
        expect(accounts).toHaveLength(1);
        expect(accounts[0].userId).toBe(existing.user.id);
        expect((await sessionOf(browser))?.user.id).toBe(existing.user.id);
      });
    });

    // ─────────────────────────── must be refused ───────────────────────────

    describe("coming back from Google with something wrong", () => {
      it("4. replaying a return link that was already used creates nothing and ends on the sign-in page with an error code", async () => {
        const browser = newBrowser();
        const who = person("replay");
        const authorizationUrl = await pressContinueWithGoogle(browser, TALENT_SIGNUP_PAGE);
        const returnLink = google.consent(authorizationUrl, who);
        const withOriginalCookies = browser.clone();

        const first = await browser.visit(returnLink, { crossSite: true });
        expect(first.headers.get("location")).toBe(`${ORIGIN}/en/continuer`);
        const created = await rowsFor(who);
        expect(created.users).toHaveLength(1);
        expect(created.accounts).toHaveLength(1);
        const exchangesAfterFirst = google.requests.token.length;
        expect(consoleError).not.toHaveBeenCalled();

        // Same browser, same link: the one-time cookies were consumed.
        const second = await browser.visit(returnLink, { crossSite: true });
        const secondLocation = locationOf(second);
        expect(secondLocation.origin).toBe(ORIGIN);
        expect(secondLocation.pathname).toBe("/connexion");
        expect(secondLocation.searchParams.get("error")).toBe("Configuration");
        expect(await second.text()).toBe("");
        expect(google.requests.token).toHaveLength(exchangesAfterFirst);
        // The person who signed in a moment ago is still signed in.
        expect((await sessionOf(browser))?.user.email).toBe(who.email);

        // Someone else who got hold of the link, in a browser of their own.
        const stranger = newBrowser();
        await expectRefusal(await stranger.visit(returnLink, { crossSite: true }), stranger, {
          path: "/connexion",
          code: "Configuration",
        });
        expect(google.requests.token).toHaveLength(exchangesAfterFirst);

        // Even with the original cookies put back, Google refuses a used code.
        await expectRefusal(
          await withOriginalCookies.visit(returnLink, { crossSite: true }),
          withOriginalCookies,
          { path: "/connexion", code: "Configuration" }
        );
        expect(google.requests.token).toHaveLength(exchangesAfterFirst + 1);
        expect(google.requests.token.at(-1)).toMatchObject({ status: 400, error: "invalid_grant" });

        const after = await rowsFor(who);
        expect(after.users.map((user) => user.id)).toEqual(created.users.map((user) => user.id));
        expect(after.accounts.map((account) => account.id)).toEqual(
          created.accounts.map((account) => account.id)
        );
        expect(await prisma.auditLog.count({ where: { actorUserId: created.users[0].id } })).toBe(1);
        expect(consoleError).toHaveBeenCalled();
      });

      it("5a. a return link whose state value was changed is refused before Google is asked anything", async () => {
        const browser = newBrowser();
        const who = person("bad-state");
        const authorizationUrl = await pressContinueWithGoogle(browser, TALENT_SIGNUP_PAGE);
        const returnLink = new URL(google.consent(authorizationUrl, who));
        returnLink.searchParams.set("state", "not-the-state-we-issued");
        const exchangesBefore = google.requests.token.length;

        const response = await browser.visit(returnLink.toString(), { crossSite: true });

        await expectRefusal(response, browser, { path: "/connexion", code: "Configuration" });
        await expectNothingCreated(who);
        expect(google.requests.token).toHaveLength(exchangesBefore);
        expect(consoleError).toHaveBeenCalled();
      });

      it("5b. a return link prepared in an attacker's browser does not sign the victim in as the attacker", async () => {
        const attacker = person("attacker");
        const attackerBrowser = newBrowser();
        const attackerLink = google.consent(
          await pressContinueWithGoogle(attackerBrowser, TALENT_SIGNUP_PAGE),
          attacker
        );
        // The victim has a sign-in of their own under way, then opens the link.
        const victimBrowser = newBrowser();
        await pressContinueWithGoogle(victimBrowser, TALENT_SIGNUP_PAGE);
        const exchangesBefore = google.requests.token.length;

        const response = await victimBrowser.visit(attackerLink, { crossSite: true });

        await expectRefusal(response, victimBrowser, { path: "/connexion", code: "Configuration" });
        await expectNothingCreated(attacker);
        expect(google.requests.token).toHaveLength(exchangesBefore);
        expect(await sessionOf(victimBrowser)).toBeNull();
      });

      it("5c. a return link arriving without the state cookie is refused", async () => {
        const browser = newBrowser();
        const who = person("no-state-cookie");
        const returnLink = google.consent(
          await pressContinueWithGoogle(browser, TALENT_SIGNUP_PAGE),
          who
        );
        browser.deleteCookie(STATE_COOKIE);
        const exchangesBefore = google.requests.token.length;

        const response = await browser.visit(returnLink, { crossSite: true });

        await expectRefusal(response, browser, { path: "/connexion", code: "Configuration" });
        await expectNothingCreated(who);
        expect(google.requests.token).toHaveLength(exchangesBefore);
      });

      it("5d. a return link arriving without the PKCE cookie is refused", async () => {
        const browser = newBrowser();
        const who = person("no-pkce-cookie");
        const returnLink = google.consent(
          await pressContinueWithGoogle(browser, TALENT_SIGNUP_PAGE),
          who
        );
        browser.deleteCookie(PKCE_COOKIE);
        const exchangesBefore = google.requests.token.length;

        const response = await browser.visit(returnLink, { crossSite: true });

        await expectRefusal(response, browser, { path: "/connexion", code: "Configuration" });
        await expectNothingCreated(who);
        expect(google.requests.token).toHaveLength(exchangesBefore);
      });

      it("5e. a PKCE secret from a different sign-in attempt is rejected by Google, and the app ends on the error path", async () => {
        const who = person("mixed-pkce");
        const browser = newBrowser();
        const firstAttempt = await pressContinueWithGoogle(browser, TALENT_SIGNUP_PAGE);
        const mixed = browser.clone();
        // A second attempt replaces both cookies; keep its PKCE cookie only.
        await pressContinueWithGoogle(browser, TALENT_SIGNUP_PAGE);
        mixed.editCookie(PKCE_COOKIE, browser.cookie(PKCE_COOKIE)!.value);
        const exchangesBefore = google.requests.token.length;

        const response = await mixed.visit(google.consent(firstAttempt, who), { crossSite: true });

        await expectRefusal(response, mixed, { path: "/connexion", code: "Configuration" });
        await expectNothingCreated(who);
        expect(google.requests.token.slice(exchangesBefore)).toMatchObject([
          { hadCodeVerifier: true, status: 400, error: "invalid_grant" },
        ]);
      });

      it("6. pressing Cancel on Google's screen comes back to the sign-in page with an error code and creates nothing", async () => {
        const browser = newBrowser();
        const authorizationUrl = await pressContinueWithGoogle(browser, TALENT_SIGNUP_PAGE);
        // Counted by prefix: other test files may share this database.
        const countTestRows = async () => ({
          users: await prisma.user.count({
            where: { email: { startsWith: PREFIX, mode: "insensitive" } },
          }),
          accounts: await prisma.account.count({
            where: { providerAccountId: { startsWith: PREFIX } },
          }),
        });
        const rowsBefore = await countTestRows();
        const exchangesBefore = google.requests.token.length;

        const response = await browser.visit(google.deny(authorizationUrl), { crossSite: true });

        await expectRefusal(response, browser, { path: "/connexion", code: "OAuthCallbackError" });
        expect(await countTestRows()).toEqual(rowsBefore);
        expect(google.requests.token).toHaveLength(exchangesBefore);
        expect(browser.cookie(PENDING_COOKIE)).toBeUndefined();
        expect(await sessionOf(browser)).toBeNull();
        // What Auth.js really does on a refusal: the one-time cookies are
        // left in place and run out on their own, within fifteen minutes.
        for (const name of [STATE_COOKIE, PKCE_COOKIE, INTENT_COOKIE]) {
          const leftover = browser.cookie(name);
          expect(leftover, name).toBeDefined();
          expect(leftover!.expiresAt! - Date.now(), name).toBeLessThanOrEqual(15 * 60 * 1000);
        }
        // They do not get in the way of trying again.
        const who = person("tries-again");
        const retry = await signInWithGoogle(browser, who, TALENT_SIGNUP_PAGE);
        expect(retry.headers.get("location")).toBe(`${ORIGIN}/en/continuer`);
        expect((await sessionOf(browser))?.user.email).toBe(who.email);
      });

      it("9. an email address Google has not verified is refused", async () => {
        const browser = newBrowser();
        const who = person("unverified", { email_verified: false });

        const response = await signInWithGoogle(browser, who, {
          page: "/fr/talents/inscription",
          mode: "signup",
          kind: "TALENT",
          locale: "fr",
        });

        await expectRefusal(response, browser, {
          path: "/fr/connexion",
          code: "oauthEmailUnverified",
          message: "errors.oauthEmailUnverified",
        });
        await expectNothingCreated(who);
        expect(browser.cookie(PENDING_COOKIE)).toBeUndefined();
        expect(browser.cookie(INTENT_COOKIE)).toBeUndefined();
      });

      const REFUSED_TOKENS: Array<[string, TokenFault]> = [
        ["10a. an ID token made out to another app (wrong audience) is refused", "wrongAudience"],
        ["10b. an ID token that has expired is refused", "expired"],
        ["10c. an ID token issued by someone other than Google (wrong issuer) is refused", "wrongIssuer"],
        ["10d. an ID token carrying a nonce the app never asked for is refused", "unexpectedNonce"],
        ["10e. an ID token with no signature at all is refused", "unsigned"],
        ["10f. an ID token signed with a shared secret instead of Google's key is refused", "signedWithClientSecret"],
      ];
      it.each(REFUSED_TOKENS)("%s", async (_name, fault) => {
        const browser = newBrowser();
        const who = person(`token-${fault}`);
        const exchangesBefore = google.requests.token.length;

        const response = await signInWithGoogle(browser, who, TALENT_SIGNUP_PAGE, { fault });

        await expectRefusal(response, browser, { path: "/connexion", code: "Configuration" });
        await expectNothingCreated(who);
        // The exchange itself went through; the token it returned was refused.
        expect(google.requests.token.slice(exchangesBefore)).toMatchObject([{ status: 200 }]);
        expect(await sessionOf(browser)).toBeNull();
        expect(consoleError).toHaveBeenCalled();
      });

      // KNOWN GAP, see docs/GOOGLE_SIGNIN_TESTS.md. Auth.js (@auth/core
      // lib/actions/callback/oauth/callback.js, through oauth4webapi
      // processAuthorizationCodeResponse) checks the claims of the ID token
      // and the algorithm named in its header, and does not check its
      // signature: the token is trusted because the app fetched it itself
      // from Google's token endpoint over TLS, which OpenID Connect Core
      // 3.1.3.7 allows. The Google provider in src/auth.ts adds no check of
      // its own. So this expectation does not hold today. The test is kept
      // as `fails`: the day a signature check is added it turns red, and the
      // marker and the test after it should then be updated.
      it("10g. a token signed with an unknown key is accepted: the signature is not checked, because the token comes straight from Google's token endpoint over TLS (allowed by OpenID Connect Core 3.1.3.7; see docs/GOOGLE_SIGNIN_TESTS.md)", async () => {
        const browser = newBrowser();
        const who = person("forged-signature-today");
        const keyDownloadsBefore = google.requests.jwks;

        const response = await signInWithGoogle(browser, who, TALENT_SIGNUP_PAGE, {
          fault: "wrongKey",
        });

        expect(response.headers.get("location")).toBe(`${ORIGIN}/en/continuer`);
        const { users, accounts } = await rowsFor(who);
        expect(users).toHaveLength(1);
        expect(accounts).toHaveLength(1);
        expect(google.requests.jwks).toBe(keyDownloadsBefore);
        expect(google.requests.jwks).toBe(0);
      });

      // KNOWN GAP, see docs/GOOGLE_SIGNIN_TESTS.md. src/auth.ts keeps the
      // default Auth.js logger. When a token is refused for one of its
      // claims, that logger prints the error's details to the server log, and
      // the details carry every claim of the token: email, name, Google id.
      // The repository rule is to log record ids only. The visitor sees none
      // of it. Kept as `fails` until the config sets a logger that leaves
      // the claims out.
      it("10i. when a token is refused, the server log does not contain the person's email or name", async () => {
        const browser = newBrowser();
        const who = person("logged-claims");
        await signInWithGoogle(browser, who, TALENT_SIGNUP_PAGE, { fault: "wrongAudience" });
        const logged = consoleError.mock.calls
          .map((call) =>
            call.map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join(" ")
          )
          .join("\n");
        expect(logged).not.toContain(who.email);
        expect(logged).not.toContain(who.name);
      });
    });

    // ─────────────────────── where the person lands ───────────────────────

    describe("where the person lands after signing in", () => {
      // Ways to write "send me to another site". What Auth.js really does
      // with each, read from the response the way a browser reads it:
      // - "home": a web address on another site is replaced by our home page;
      // - "glued": a value starting with a slash is appended to our origin;
      // - "refused": a value that is not a web address makes Auth.js refuse
      //   the whole request with a fixed JSON message and status 500.
      type Outcome = "home" | "glued" | "refused";
      const HOSTILE: Array<{ target: string; outcome: Outcome }> = [
        { target: "https://evil.example/", outcome: "home" },
        { target: "https://localhost.evil.example/", outcome: "home" },
        { target: "http://localhost:3000@evil.example/", outcome: "home" },
        { target: "//evil.example/", outcome: "glued" },
        { target: "/\\evil.example/", outcome: "glued" },
        { target: "javascript:alert(1)", outcome: "refused" },
        { target: "http://localhost:3000.evil.example/", outcome: "refused" },
      ];
      const HOSTILE_TARGETS = HOSTILE.map((entry) => entry.target);
      const AUTHJS_REFUSAL = {
        message:
          "There was a problem with the server configuration. Check the server logs for more information.",
      };

      async function expectSameSiteLanding(
        response: Response,
        browser: Browser,
        who: GooglePerson,
        expectedLocation: string
      ) {
        expect(response.headers.get("location")).toBe(expectedLocation);
        const location = locationOf(response);
        expect(location.origin).toBe(ORIGIN);
        expect(location.host).toBe("localhost:3000");
        expect(location.protocol).toBe("http:");
        expect((await sessionOf(browser))?.user.email).toBe(who.email);
      }

      async function expectRequestRefused(response: Response, browser: Browser) {
        expect(response.status).toBe(500);
        expect(response.headers.get("location")).toBeNull();
        // A fixed sentence: no stack trace, nothing echoed from the request.
        expect(await response.json()).toEqual(AUTHJS_REFUSAL);
        expect(browser.cookie(SESSION_COOKIE)).toBeUndefined();
      }

      it.each(HOSTILE)(
        "12a. a return link with callbackUrl=$target added to it never leaves our site ($outcome)",
        async ({ target, outcome }) => {
          const who = await existingGoogleTalent("landing-param");
          const browser = newBrowser();
          const returnLink = new URL(
            google.consent(await pressContinueWithGoogle(browser, SIGN_IN_PAGE), who)
          );
          returnLink.searchParams.set("callbackUrl", target);
          const exchangesBefore = google.requests.token.length;

          const response = await browser.visit(returnLink.toString(), { crossSite: true });

          if (outcome === "refused") {
            await expectRequestRefused(response, browser);
            expect(google.requests.token).toHaveLength(exchangesBefore);
          } else {
            await expectSameSiteLanding(
              response,
              browser,
              who,
              outcome === "home" ? ORIGIN : `${ORIGIN}${target}`
            );
          }
        }
      );

      it.each(HOSTILE)(
        "12b. a callback-url cookie edited to $target is never followed ($outcome)",
        async ({ target, outcome }) => {
          const who = await existingGoogleTalent("landing-cookie");
          const browser = newBrowser();
          const returnLink = google.consent(
            await pressContinueWithGoogle(browser, SIGN_IN_PAGE),
            who
          );
          browser.editCookie(CALLBACK_URL_COOKIE, target);
          const exchangesBefore = google.requests.token.length;

          const response = await browser.visit(returnLink, { crossSite: true });

          if (outcome === "refused") {
            await expectRequestRefused(response, browser);
            expect(google.requests.token).toHaveLength(exchangesBefore);
          } else {
            await expectSameSiteLanding(
              response,
              browser,
              who,
              outcome === "home" ? ORIGIN : `${ORIGIN}${target}`
            );
          }
        }
      );

      it("12c. the button's form cannot be made to choose the landing page: a hostile language or extra field still leads to /en/continuer", async () => {
        for (const hostile of HOSTILE_TARGETS) {
          const browser = newBrowser();
          const target = await pressContinueWithGoogle(
            browser,
            { ...SIGN_IN_PAGE, locale: hostile },
            { callbackUrl: hostile, redirectTo: hostile, redirect_uri: hostile }
          );
          expect(new URL(target).searchParams.get("redirect_uri")).toBe(CALLBACK);
          expect(browser.cookie(CALLBACK_URL_COOKIE)!.value).toBe(`${ORIGIN}/en/continuer`);
          expect(await verifyCookieValue("oauth-intent", browser.cookie(INTENT_COOKIE)!.value)).toEqual({
            mode: "signin",
            locale: "en",
          });
        }
      });

      it("12d. the raw sign-in address, used with a valid anti-forgery token and a landing page on another site, stores our own origin instead", async () => {
        const browser = newBrowser();
        const csrf = (await (await browser.visit("/api/auth/csrf")).json()) as { csrfToken: string };

        const response = await browser.visit("/api/auth/signin/google", {
          method: "POST",
          form: { csrfToken: csrf.csrfToken, callbackUrl: "https://evil.example/" },
        });

        const location = locationOf(response);
        expect(`${location.origin}${location.pathname}`).toBe(GOOGLE_AUTHORIZATION_ENDPOINT);
        expect(location.searchParams.get("redirect_uri")).toBe(CALLBACK);
        expect(browser.cookie(CALLBACK_URL_COOKIE)!.value).toBe(ORIGIN);
      });

      it("12e. the session reset route only ever sends the visitor to our own sign-in page", async () => {
        for (const hostile of HOSTILE_TARGETS) {
          const browser = newBrowser();
          const response = await browser.visit(
            `/api/session/reset?locale=${encodeURIComponent(hostile)}`
          );
          expect(response.status).toBe(303);
          expect(response.headers.get("location")).toBe(`${ORIGIN}/en/connexion`);
        }
      });

      it("12f. a visitor who breaks their own callback-url cookie gets an error from every sign-in request and is treated as signed out: nothing is exposed", async () => {
        const browser = newBrowser();
        const who = person("broken-cookie");
        await signInWithGoogle(browser, who, TALENT_SIGNUP_PAGE);
        browser.editCookie(CALLBACK_URL_COOKIE, "javascript:alert(1)");

        const response = await browser.visit("/api/auth/session");
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual(AUTHJS_REFUSAL);
        // Server code asking "who is this?" gets that same object: no user.
        const { auth } = await import("@/auth");
        const seen = await browser.submit("/en/talents/app", () => auth());
        expect((seen.result as { user?: unknown } | null)?.user).toBeUndefined();

        // Once the edited cookie is removed, the session is back.
        browser.deleteCookie(CALLBACK_URL_COOKIE);
        expect((await sessionOf(browser))?.user.email).toBe(who.email);
      });
    });

    // ────────────────────────────── sessions ──────────────────────────────

    describe("sessions", () => {
      it("14. signed out, with no cookie: the session endpoint returns no user", async () => {
        const browser = newBrowser();
        const response = await browser.visit("/api/auth/session");
        expect(response.status).toBe(200);
        expect(await response.json()).toBeNull();
        expect(response.headers.get("cache-control")).toContain("no-store");
        expect(browser.cookie(SESSION_COOKIE)).toBeUndefined();
        expect(consoleError).not.toHaveBeenCalled();
      });

      it("14b. a made-up session cookie, or one sealed with another secret, opens nothing and is removed", async () => {
        const who = await existingGoogleTalent("forged-session");
        const { users } = await rowsFor(who);

        const garbage = newBrowser();
        garbage.editCookie(SESSION_COOKIE, "not-a-session");
        expect(await sessionOf(garbage)).toBeNull();
        expect(garbage.cookie(SESSION_COOKIE)).toBeUndefined();

        const forged = newBrowser();
        forged.editCookie(
          SESSION_COOKIE,
          await encode({
            token: { sub: users[0].id, email: who.email, kind: "TALENT", authAt: Date.now() },
            secret: randomBytes(32).toString("base64url"),
            salt: SESSION_COOKIE,
          })
        );
        expect(await sessionOf(forged)).toBeNull();
        expect(forged.cookie(SESSION_COOKIE)).toBeUndefined();
      });

      it("18. reloading keeps the person signed in, and the session cookie is renewed", async () => {
        const browser = newBrowser();
        const who = person("refresh");
        await signInWithGoogle(browser, who, TALENT_SIGNUP_PAGE);
        const firstCookie = browser.cookie(SESSION_COOKIE)!.value;

        const first = await sessionOf(browser);
        const second = await sessionOf(browser);

        expect(first?.user.email).toBe(who.email);
        expect(second?.user).toEqual(first?.user);
        expect(browser.cookie(SESSION_COOKIE)).toBeDefined();
        expect(browser.cookie(SESSION_COOKIE)!.value).not.toBe(firstCookie);
        expect(browser.cookie(SESSION_COOKIE)!.httpOnly).toBe(true);
        expect(consoleError).not.toHaveBeenCalled();
      });

      it("19. signing out removes the session cookie, and the session endpoint returns no user again", async () => {
        const browser = newBrowser();
        const who = person("sign-out");
        await signInWithGoogle(browser, who, TALENT_SIGNUP_PAGE);
        expect((await sessionOf(browser))?.user.email).toBe(who.email);

        const { logoutAction } = await import("@/app/actions/auth");
        const { redirect } = await browser.submit("/en/talents/app", () => logoutAction());

        expect(new URL(redirect!, ORIGIN).origin).toBe(ORIGIN);
        expect(new URL(redirect!, ORIGIN).pathname).toBe("/");
        expect(browser.cookie(SESSION_COOKIE)).toBeUndefined();
        expect(await sessionOf(browser)).toBeNull();
        // The account is still there for the next sign-in.
        expect((await rowsFor(who)).users).toHaveLength(1);
      });

      it("20. a session whose account was deleted is refused on its next request", async () => {
        const browser = newBrowser();
        const who = person("deleted");
        await signInWithGoogle(browser, who, TALENT_SIGNUP_PAGE);
        const { users } = await rowsFor(who);
        expect((await sessionOf(browser))?.user.id).toBe(users[0].id);

        await prisma.auditLog.deleteMany({ where: { actorUserId: users[0].id } });
        await prisma.user.delete({ where: { id: users[0].id } });

        expect(await sessionOf(browser)).toBeNull();
        expect(browser.cookie(SESSION_COOKIE)).toBeUndefined();
      });
    });

    // ───────────────────────────── the network ─────────────────────────────

    describe("the network", () => {
      it("22. nothing left the process: every outside call in this run went to the fake Google", () => {
        expect(google.requests.blocked).toEqual([]);
        expect(google.requests.discovery).toBeGreaterThan(0);
        expect(google.requests.token.length).toBeGreaterThan(0);
        // Google is an OpenID provider: the profile comes from the ID token.
        expect(google.requests.userinfo).toBe(0);
      });
    });
  }
);
