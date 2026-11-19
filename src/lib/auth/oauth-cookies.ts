import { cookies, headers } from "next/headers";
import { z } from "zod";
import { UserKind } from "@/domain/enums";
import { toLocale } from "@/i18n/routing";
import { OAUTH_PROVIDER_IDS } from "./oauth-providers";
import type { OAuthIdentity } from "./oauth-identity";
import type { OAuthIntent } from "./resolve-oauth-user";
import {
  signCookieValue,
  signedCookieName,
  signedCookieOptions,
  verifyCookieValue,
  type SignedCookieLabel,
} from "./signed-cookie";

/**
 * The two OAuth cookies, read and written through next/headers. Writes only
 * work in a server action or a route handler; the /continuer page only reads.
 *
 * The intent cookie is scoped to /api/auth, the only place that reads it. The
 * pending identity is read by /<locale>/continuer, so it lives on "/".
 */

const INTENT = { label: "oauth-intent", base: "oauth-intent", path: "/api/auth" } as const;
const PENDING = { label: "pending-oauth", base: "pending-oauth", path: "/" } as const;

type Spec = { label: SignedCookieLabel; base: string; path: string };

const IntentShape = z.object({
  mode: z.enum(["signin", "signup"]),
  kind: UserKind.optional(),
  locale: z.string(),
});

const PendingShape = z.object({
  provider: z.enum(OAUTH_PROVIDER_IDS),
  sub: z.string().min(1).max(255),
  email: z.string().email().max(320),
  name: z.string().max(100).nullable(),
  image: z.string().max(2048).nullable(),
});

/**
 * Whether this request reached us over https. Auth.js makes the same call for
 * its own cookies from the forwarded protocol (trustHost) or AUTH_URL.
 */
async function isSecureRequest(): Promise<boolean> {
  const proto = (await headers()).get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  return process.env.AUTH_URL?.startsWith("https://") ?? false;
}

async function write(spec: Spec, payload: Record<string, unknown>) {
  const secure = await isSecureRequest();
  const value = await signCookieValue(spec.label, payload);
  (await cookies()).set(
    signedCookieName(spec.base, secure),
    value,
    signedCookieOptions(secure, spec.path)
  );
}

async function read(spec: Spec): Promise<Record<string, unknown> | null> {
  const secure = await isSecureRequest();
  const raw = (await cookies()).get(signedCookieName(spec.base, secure))?.value;
  return verifyCookieValue(spec.label, raw);
}

async function clear(spec: Spec) {
  const secure = await isSecureRequest();
  (await cookies()).set(signedCookieName(spec.base, secure), "", {
    ...signedCookieOptions(secure, spec.path),
    maxAge: 0,
  });
}

export async function writeIntentCookie(intent: OAuthIntent): Promise<void> {
  await write(INTENT, { ...intent });
}

export async function readIntentCookie(): Promise<OAuthIntent | null> {
  const parsed = IntentShape.safeParse(await read(INTENT));
  if (!parsed.success) return null;
  return { ...parsed.data, locale: toLocale(parsed.data.locale) };
}

export async function clearIntentCookie(): Promise<void> {
  await clear(INTENT);
}

export async function writePendingCookie(identity: OAuthIdentity): Promise<void> {
  await write(PENDING, {
    provider: identity.provider,
    sub: identity.providerAccountId,
    email: identity.email,
    name: identity.name,
    image: identity.image,
  });
}

export async function readPendingCookie(): Promise<OAuthIdentity | null> {
  const parsed = PendingShape.safeParse(await read(PENDING));
  if (!parsed.success) return null;
  const p = parsed.data;
  return {
    provider: p.provider,
    providerAccountId: p.sub,
    email: p.email,
    // A parked identity only ever creates a new account. If an account took
    // this address in the meantime, it is refused, never joined.
    emailAuthoritative: false,
    name: p.name,
    image: p.image,
  };
}

export async function clearPendingCookie(): Promise<void> {
  await clear(PENDING);
}
