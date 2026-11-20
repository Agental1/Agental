import { createHash, randomBytes } from "node:crypto";
import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";

/**
 * A stand-in for Google's sign-in service, living inside the test process.
 *
 * It plays the three parts of Google the app talks to:
 *
 * - the consent screen (`consent` and `deny`): what a person does in the
 *   browser, returning the address Google sends the browser back to;
 * - the discovery document and the public keys, served through `fetch`;
 * - the token endpoint, served through `fetch`, which checks the client
 *   secret, the redirect URI, the one-time code and the PKCE verifier the way
 *   Google does, then answers with an ID token signed by this fake's own key.
 *
 * Everything stays inside the process. `fetch` answers for Google's hosts and
 * refuses every other host, and each refusal is recorded so a test can prove
 * that the network was left alone.
 */

export const GOOGLE_ISSUER = "https://accounts.google.com";
export const GOOGLE_AUTHORIZATION_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_USERINFO_ENDPOINT =
  "https://openidconnect.googleapis.com/v1/userinfo";
const DISCOVERY_URL = `${GOOGLE_ISSUER}/.well-known/openid-configuration`;

/** The person signing in, as Google describes them in the ID token. */
export interface GooglePerson {
  /** Google's stable id for the person. */
  sub: string;
  email: string;
  /** Defaults to true. */
  email_verified?: boolean;
  name?: string;
  picture?: string;
  /** Present on Google Workspace accounts only: the organization's domain. */
  hd?: string;
}

/** Ways the ID token can be wrong. Each one is a separate test. */
export type TokenFault =
  | "wrongKey"
  | "wrongAudience"
  | "wrongIssuer"
  | "expired"
  | "unexpectedNonce"
  | "unsigned"
  | "signedWithClientSecret";

export interface TokenRequestRecord {
  grantType: string | null;
  redirectUri: string | null;
  hadCodeVerifier: boolean;
  clientAuthenticated: boolean;
  /** HTTP status this fake answered with. */
  status: number;
  /** OAuth error code this fake answered with, if any. */
  error: string | null;
}

interface PendingCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string | null;
  nonce: string | null;
  scope: string;
  person: GooglePerson;
  fault: TokenFault | null;
  used: boolean;
}

export interface FakeGoogleOptions {
  clientId: string;
  clientSecret: string;
  /** The "Authorized redirect URIs" registered in the Google console. */
  redirectUris: string[];
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export class FakeGoogle {
  /** What the app asked this fake for, for assertions. */
  readonly requests = {
    discovery: 0,
    jwks: 0,
    userinfo: 0,
    token: [] as TokenRequestRecord[],
    /** Calls to hosts that are not Google. Must stay empty. */
    blocked: [] as string[],
  };

  private readonly codes = new Map<string, PendingCode>();

  private constructor(
    private readonly options: FakeGoogleOptions,
    private readonly signingKey: CryptoKey,
    private readonly publicJwk: JWK,
    /** A key Google never published, for the forged-token case. */
    private readonly rogueKey: CryptoKey
  ) {}

  static async create(options: FakeGoogleOptions): Promise<FakeGoogle> {
    const real = await generateKeyPair("RS256");
    const rogue = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(real.publicKey);
    return new FakeGoogle(
      options,
      real.privateKey,
      { ...publicJwk, kid: "fake-google-key-1", alg: "RS256", use: "sig" },
      rogue.privateKey
    );
  }

  // ───────────────────────── the consent screen ─────────────────────────

  /**
   * The person picks their account and agrees. Returns the address Google
   * redirects the browser to. Throws where Google would show an error page
   * instead of redirecting (unknown client, unregistered redirect URI).
   */
  consent(
    authorizationUrl: string,
    person: GooglePerson,
    options: { fault?: TokenFault } = {}
  ): string {
    const request = this.readAuthorizationRequest(authorizationUrl);
    const code = `4/fake-${randomBytes(18).toString("base64url")}`;
    this.codes.set(code, {
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
      nonce: request.nonce,
      scope: request.scope,
      person,
      fault: options.fault ?? null,
      used: false,
    });
    const back = new URL(request.redirectUri);
    if (request.state !== null) back.searchParams.set("state", request.state);
    back.searchParams.set("code", code);
    back.searchParams.set("scope", "email profile openid");
    back.searchParams.set("authuser", "0");
    back.searchParams.set("prompt", "consent");
    return back.toString();
  }

  /** The person presses Cancel on the consent screen. */
  deny(authorizationUrl: string): string {
    const request = this.readAuthorizationRequest(authorizationUrl);
    const back = new URL(request.redirectUri);
    back.searchParams.set("error", "access_denied");
    if (request.state !== null) back.searchParams.set("state", request.state);
    return back.toString();
  }

  private readAuthorizationRequest(authorizationUrl: string) {
    const url = new URL(authorizationUrl);
    if (`${url.origin}${url.pathname}` !== GOOGLE_AUTHORIZATION_ENDPOINT) {
      throw new Error(`Not Google's authorization endpoint: ${url.origin}${url.pathname}`);
    }
    const q = url.searchParams;
    const clientId = q.get("client_id");
    const redirectUri = q.get("redirect_uri");
    if (clientId !== this.options.clientId) {
      throw new Error("Google error page: 401 invalid_client (unknown client id)");
    }
    if (!redirectUri || !this.options.redirectUris.includes(redirectUri)) {
      throw new Error(
        `Google error page: 400 redirect_uri_mismatch (${redirectUri} is not registered)`
      );
    }
    if (q.get("response_type") !== "code") {
      throw new Error("Google error page: 400 unsupported response_type");
    }
    const scope = q.get("scope") ?? "";
    if (!scope.split(" ").includes("openid")) {
      throw new Error("Google error page: 400 invalid_scope (openid missing)");
    }
    const method = q.get("code_challenge_method");
    if (q.has("code_challenge") && method !== "S256" && method !== "plain") {
      throw new Error("Google error page: 400 invalid code_challenge_method");
    }
    return {
      clientId,
      redirectUri,
      scope,
      state: q.get("state"),
      codeChallenge: q.get("code_challenge"),
      nonce: q.get("nonce"),
    };
  }

  // ─────────────────────────── the HTTP side ────────────────────────────

  /** Replacement for global `fetch`. An arrow so it can be passed around. */
  readonly fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const address = `${url.origin}${url.pathname}`;

    if (address === DISCOVERY_URL) {
      this.requests.discovery += 1;
      return json(this.discoveryDocument());
    }
    if (address === GOOGLE_JWKS_URI) {
      this.requests.jwks += 1;
      return json({ keys: [this.publicJwk] });
    }
    if (address === GOOGLE_TOKEN_ENDPOINT && request.method === "POST") {
      return this.token(request);
    }
    if (address === GOOGLE_USERINFO_ENDPOINT) {
      this.requests.userinfo += 1;
      return json({ error: "invalid_token" }, 401);
    }
    this.requests.blocked.push(`${request.method} ${url.host}${url.pathname}`);
    throw new Error(
      `Blocked network call to ${url.host}: this test must not leave the process.`
    );
  };

  private discoveryDocument() {
    return {
      issuer: GOOGLE_ISSUER,
      authorization_endpoint: GOOGLE_AUTHORIZATION_ENDPOINT,
      token_endpoint: GOOGLE_TOKEN_ENDPOINT,
      userinfo_endpoint: GOOGLE_USERINFO_ENDPOINT,
      jwks_uri: GOOGLE_JWKS_URI,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      scopes_supported: ["openid", "email", "profile"],
      token_endpoint_auth_methods_supported: [
        "client_secret_post",
        "client_secret_basic",
      ],
      code_challenge_methods_supported: ["plain", "S256"],
      grant_types_supported: ["authorization_code", "refresh_token"],
    };
  }

  private async token(request: Request): Promise<Response> {
    const body = new URLSearchParams(await request.text());
    const record: TokenRequestRecord = {
      grantType: body.get("grant_type"),
      redirectUri: body.get("redirect_uri"),
      hadCodeVerifier: body.has("code_verifier"),
      clientAuthenticated: false,
      status: 200,
      error: null,
    };
    this.requests.token.push(record);
    const refuse = (status: number, error: string, description: string) => {
      record.status = status;
      record.error = error;
      return json({ error, error_description: description }, status);
    };

    const client = this.readClientCredentials(request, body);
    if (
      client.id !== this.options.clientId ||
      client.secret !== this.options.clientSecret
    ) {
      return refuse(401, "invalid_client", "Unauthorized");
    }
    record.clientAuthenticated = true;

    if (body.get("grant_type") !== "authorization_code") {
      return refuse(400, "unsupported_grant_type", "Invalid grant_type");
    }
    const code = body.get("code") ?? "";
    const pending = this.codes.get(code);
    // A code works once. Google answers a second use with invalid_grant.
    if (!pending || pending.used || pending.clientId !== client.id) {
      return refuse(400, "invalid_grant", "Bad Request");
    }
    pending.used = true;
    if (body.get("redirect_uri") !== pending.redirectUri) {
      return refuse(400, "redirect_uri_mismatch", "Bad Request");
    }
    if (pending.codeChallenge !== null) {
      const verifier = body.get("code_verifier") ?? "";
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      if (challenge !== pending.codeChallenge) {
        return refuse(400, "invalid_grant", "Invalid code verifier.");
      }
    }

    return json({
      access_token: `ya29.fake-${randomBytes(24).toString("base64url")}`,
      expires_in: 3599,
      scope: "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
      token_type: "Bearer",
      id_token: await this.idToken(pending),
    });
  }

  private readClientCredentials(request: Request, body: URLSearchParams) {
    const header = request.headers.get("authorization") ?? "";
    if (header.startsWith("Basic ")) {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      const colon = decoded.indexOf(":");
      // RFC 6749 2.3.1: both halves are form-urlencoded before base64.
      const decode = (part: string) => decodeURIComponent(part.replace(/\+/g, "%20"));
      return {
        id: decode(decoded.slice(0, colon)),
        secret: decode(decoded.slice(colon + 1)),
      };
    }
    return { id: body.get("client_id"), secret: body.get("client_secret") };
  }

  private async idToken(pending: PendingCode): Promise<string> {
    const { person, fault } = pending;
    const now = Math.floor(Date.now() / 1000);
    const claims: Record<string, unknown> = {
      azp: pending.clientId,
      email: person.email,
      email_verified: person.email_verified ?? true,
    };
    if (person.name) claims.name = person.name;
    if (person.picture) claims.picture = person.picture;
    if (person.hd) claims.hd = person.hd;
    if (pending.nonce) claims.nonce = pending.nonce;
    if (fault === "unexpectedNonce") claims.nonce = "a-nonce-the-app-never-sent";

    const issuer = fault === "wrongIssuer" ? "https://accounts.evil.example" : GOOGLE_ISSUER;
    const audience =
      fault === "wrongAudience"
        ? "another-app.apps.googleusercontent.com"
        : pending.clientId;
    // Two hours in the past for the expired case, well beyond any tolerance.
    const issuedAt = fault === "expired" ? now - 3 * 3600 : now;
    const expiresAt = fault === "expired" ? now - 2 * 3600 : now + 3600;
    const payload = {
      iss: issuer,
      ...claims,
      aud: audience,
      sub: person.sub,
      iat: issuedAt,
      exp: expiresAt,
    };

    if (fault === "unsigned") {
      const header = base64url(JSON.stringify({ alg: "none", typ: "JWT" }));
      return `${header}.${base64url(JSON.stringify(payload))}.`;
    }
    if (fault === "signedWithClientSecret") {
      // The key-confusion trick: an HMAC token keyed with a value the
      // attacker might know, hoping the verifier accepts any algorithm.
      return new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .sign(new TextEncoder().encode(this.options.clientSecret));
    }
    // The forged token names Google's real key id, so only an actual
    // signature check can tell it apart.
    return new SignJWT(payload)
      .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: this.publicJwk.kid })
      .sign(fault === "wrongKey" ? this.rogueKey : this.signingKey);
  }
}
