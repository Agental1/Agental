import { AsyncLocalStorage } from "node:async_hooks";
import { NextRequest } from "next/server";

/**
 * A stand-in for the browser and for the thin layer of Next.js that sits
 * between the browser and the app's own code.
 *
 * - `Browser` keeps a cookie jar and applies the rules a browser applies:
 *   path scoping, expiry, deletion by Max-Age=0, and SameSite on requests that
 *   arrive from another site. It never follows a redirect on its own, so a
 *   test sees every hop.
 * - `nextHeadersStandIn` replaces `next/headers`. Inside a request started by
 *   a `Browser`, `cookies()` and `headers()` answer for that request, and
 *   cookies set through `cookies().set()` go back to the browser, the way
 *   Next.js adds them to the response of a route handler or a server action.
 *
 * What this replaces is Next.js plumbing only. The route handlers and server
 * actions it calls are the app's real ones.
 */

export const ORIGIN = "http://localhost:3000";

type SameSite = "lax" | "strict" | "none";

export interface CookieRecord {
  name: string;
  /** As the browser stores it: still percent-encoded. */
  raw: string;
  /** Decoded, as server code reads it. */
  value: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: SameSite | null;
  /** Milliseconds since the epoch, or null for a session cookie. */
  expiresAt: number | null;
}

/** The options object `cookies().set(name, value, options)` accepts. */
interface CookieSetOptions {
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: SameSite | boolean;
  maxAge?: number;
  expires?: Date | number | string;
}

interface CookieChange {
  record: CookieRecord;
  /** True when the server asked the browser to drop the cookie. */
  remove: boolean;
}

interface RequestScope {
  headers: Headers;
  incoming: Map<string, string>;
  changes: CookieChange[];
}

const requestScope = new AsyncLocalStorage<RequestScope>();

function currentScope(): RequestScope {
  const scope = requestScope.getStore();
  if (!scope) {
    throw new Error("next/headers was used outside a request started by the test browser.");
  }
  return scope;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeSameSite(value: unknown): SameSite | null {
  if (value === true) return "strict";
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase();
  return lower === "lax" || lower === "strict" || lower === "none" ? lower : null;
}

function changeFromOptions(
  name: string,
  value: string,
  options: CookieSetOptions = {}
): CookieChange {
  const now = Date.now();
  let expiresAt: number | null = null;
  let remove = false;
  if (typeof options.maxAge === "number") {
    if (options.maxAge <= 0) remove = true;
    else expiresAt = now + options.maxAge * 1000;
  } else if (options.expires !== undefined) {
    expiresAt = new Date(options.expires).getTime();
    if (expiresAt <= now) remove = true;
  }
  return {
    remove,
    record: {
      name,
      raw: encodeURIComponent(value),
      value,
      path: options.path ?? "/",
      httpOnly: options.httpOnly ?? false,
      secure: options.secure ?? false,
      sameSite: normalizeSameSite(options.sameSite),
      expiresAt,
    },
  };
}

/** Parse one Set-Cookie response header the way a browser does. */
function changeFromHeader(header: string): CookieChange | null {
  const [pair, ...attributes] = header.split(";");
  const equals = pair.indexOf("=");
  if (equals < 1) return null;
  const name = pair.slice(0, equals).trim();
  const raw = pair.slice(equals + 1).trim();
  const options: CookieSetOptions = {};
  for (const attribute of attributes) {
    const separator = attribute.indexOf("=");
    const key = (separator < 0 ? attribute : attribute.slice(0, separator)).trim().toLowerCase();
    const attributeValue = separator < 0 ? "" : attribute.slice(separator + 1).trim();
    if (key === "path") options.path = attributeValue;
    else if (key === "httponly") options.httpOnly = true;
    else if (key === "secure") options.secure = true;
    else if (key === "samesite") options.sameSite = normalizeSameSite(attributeValue) ?? undefined;
    else if (key === "max-age") options.maxAge = Number(attributeValue);
    else if (key === "expires") options.expires = attributeValue;
  }
  const change = changeFromOptions(name, safeDecode(raw), options);
  change.record.raw = raw;
  return change;
}

/** RFC 6265 section 5.1.4. */
function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/";
}

/** The module that replaces `next/headers` in these tests. */
export const nextHeadersStandIn = {
  async headers(): Promise<Headers> {
    return currentScope().headers;
  },
  async cookies() {
    const scope = currentScope();
    const read = (name: string): string | undefined => {
      // A cookie set earlier in the same request is visible to later reads.
      for (let i = scope.changes.length - 1; i >= 0; i--) {
        const change = scope.changes[i];
        if (change.record.name === name) {
          return change.remove ? undefined : change.record.value;
        }
      }
      return scope.incoming.get(name);
    };
    return {
      get(name: string) {
        const value = read(name);
        return value === undefined ? undefined : { name, value };
      },
      has(name: string) {
        return read(name) !== undefined;
      },
      getAll() {
        const names = new Set([
          ...scope.incoming.keys(),
          ...scope.changes.map((change) => change.record.name),
        ]);
        return [...names]
          .map((name) => ({ name, value: read(name) }))
          .filter((cookie): cookie is { name: string; value: string } => cookie.value !== undefined);
      },
      set(name: string, value: string, options?: CookieSetOptions) {
        scope.changes.push(changeFromOptions(name, value, options));
      },
      delete(name: string) {
        scope.changes.push(changeFromOptions(name, "", { maxAge: 0 }));
      },
    };
  },
};

export type AppRouter = (request: NextRequest) => Promise<Response>;

export interface VisitOptions {
  method?: "GET" | "POST";
  /** Form fields for a POST. */
  form?: Record<string, string>;
  /**
   * True when another site sent the browser here: Google's redirect back to
   * the app, or a form on a hostile page. SameSite then decides which cookies
   * travel.
   */
  crossSite?: boolean;
}

export interface ActionOutcome<T> {
  /** Where the action redirected to, or null when it returned normally. */
  redirect: string | null;
  /** What the action returned, when it did not redirect. */
  result: T | undefined;
}

export class Browser {
  private jar = new Map<string, CookieRecord>();

  constructor(private readonly app: AppRouter) {}

  // ───────────────────────────── the cookie jar ─────────────────────────────

  private apply(change: CookieChange) {
    const key = `${change.record.name}\u0000${change.record.path}`;
    if (change.remove) this.jar.delete(key);
    else this.jar.set(key, change.record);
  }

  private live(): CookieRecord[] {
    const now = Date.now();
    return [...this.jar.values()].filter(
      (cookie) => cookie.expiresAt === null || cookie.expiresAt > now
    );
  }

  /** The cookie with this name, whatever its path. */
  cookie(name: string): CookieRecord | undefined {
    return this.live().find((cookie) => cookie.name === name);
  }

  cookieNames(): string[] {
    return this.live().map((cookie) => cookie.name).sort();
  }

  /** What a visitor does with the developer tools: drop a cookie. */
  deleteCookie(name: string) {
    for (const [key, cookie] of this.jar) {
      if (cookie.name === name) this.jar.delete(key);
    }
  }

  /** What a visitor does with the developer tools: edit a cookie's value. */
  editCookie(name: string, value: string) {
    const existing = this.cookie(name);
    this.apply({
      remove: false,
      record: {
        name,
        raw: encodeURIComponent(value),
        value,
        path: existing?.path ?? "/",
        httpOnly: existing?.httpOnly ?? false,
        secure: existing?.secure ?? false,
        sameSite: existing?.sameSite ?? "lax",
        expiresAt: existing?.expiresAt ?? null,
      },
    });
  }

  /** A second browser holding a copy of this one's cookies, taken now. */
  clone(): Browser {
    const copy = new Browser(this.app);
    copy.jar = new Map([...this.jar].map(([key, cookie]) => [key, { ...cookie }]));
    return copy;
  }

  private cookieHeader(url: URL, method: string, crossSite: boolean): string {
    return this.live()
      .filter((cookie) => pathMatches(url.pathname, cookie.path))
      .filter((cookie) => !cookie.secure || url.protocol === "https:")
      .filter((cookie) => {
        if (!crossSite) return true;
        // Browsers treat a cookie with no SameSite attribute as Lax.
        const sameSite = cookie.sameSite ?? "lax";
        if (sameSite === "none") return true;
        return sameSite === "lax" && method === "GET";
      })
      .map((cookie) => `${cookie.name}=${cookie.raw}`)
      .join("; ");
  }

  private scopeFor(url: URL, method: string, crossSite: boolean, extra: Record<string, string>) {
    const cookie = this.cookieHeader(url, method, crossSite);
    // Next.js adds the forwarded headers itself, in development and in production.
    const headers = new Headers({
      host: url.host,
      "x-forwarded-host": url.host,
      "x-forwarded-proto": url.protocol.replace(":", ""),
      ...extra,
    });
    if (cookie) headers.set("cookie", cookie);
    const incoming = new Map<string, string>();
    for (const part of cookie ? cookie.split("; ") : []) {
      const equals = part.indexOf("=");
      incoming.set(part.slice(0, equals), safeDecode(part.slice(equals + 1)));
    }
    return { headers, incoming, changes: [] as CookieChange[] };
  }

  // ─────────────────────────────── requests ────────────────────────────────

  /**
   * Request an address of the app and store the cookies it answers with.
   * Redirects are returned, never followed.
   */
  async visit(address: string, options: VisitOptions = {}): Promise<Response> {
    const url = new URL(address, ORIGIN);
    if (url.origin !== ORIGIN) {
      throw new Error(`The test browser only talks to ${ORIGIN}; refused ${url.origin}.`);
    }
    const method = options.method ?? "GET";
    const scope = this.scopeFor(
      url,
      method,
      options.crossSite ?? false,
      method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}
    );
    const request = new NextRequest(url, {
      method,
      headers: scope.headers,
      body: method === "POST" ? new URLSearchParams(options.form ?? {}).toString() : undefined,
    });
    const response = await requestScope.run(scope, () => this.app(request));
    // Next.js adds cookies().set() values to the response; a cookie the
    // handler put on the response itself wins over one with the same name.
    for (const change of scope.changes) this.apply(change);
    for (const header of response.headers.getSetCookie()) {
      const change = changeFromHeader(header);
      if (change) this.apply(change);
    }
    return response;
  }

  /**
   * Submit a form bound to a server action, from the page at `fromPath`.
   * Next.js turns the redirect a server action throws into a redirect
   * response and sends along the cookies the action set; this does the same.
   */
  async submit<T>(fromPath: string, action: () => Promise<T>): Promise<ActionOutcome<T>> {
    const url = new URL(fromPath, ORIGIN);
    const scope = this.scopeFor(url, "POST", false, {
      origin: ORIGIN,
      referer: url.toString(),
    });
    let outcome: ActionOutcome<T>;
    try {
      const result = await requestScope.run(scope, action);
      outcome = { redirect: null, result };
    } catch (error) {
      const target = redirectTarget(error);
      if (target === null) throw error;
      outcome = { redirect: target, result: undefined };
    }
    for (const change of scope.changes) this.apply(change);
    return outcome;
  }
}

/**
 * The address inside the error Next.js throws for `redirect()`, or null for
 * any other error. The digest reads "NEXT_REDIRECT;<type>;<url>;<status>;".
 */
export function redirectTarget(error: unknown): string | null {
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT;")) return null;
  return digest.split(";").slice(2, -2).join(";");
}
