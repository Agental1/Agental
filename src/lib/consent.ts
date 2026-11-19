import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  parseConsentCookie,
  serializeConsent,
  type ConsentChoice,
} from "@/domain/consent";

/** The choice in the visitor's consent cookie, or null when there is none. */
export async function readConsentCookie(): Promise<ConsentChoice | null> {
  return parseConsentCookie((await cookies()).get(CONSENT_COOKIE)?.value);
}

/**
 * Write the consent cookie. Readable by scripts on purpose: the page decides
 * from it whether an optional script may load. It holds two booleans and
 * nothing about the person.
 */
export async function writeConsentCookie(choice: ConsentChoice): Promise<void> {
  (await cookies()).set(CONSENT_COOKIE, serializeConsent(choice), {
    path: "/",
    maxAge: CONSENT_MAX_AGE_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  });
}

export interface StoredConsent extends ConsentChoice {
  /** When the current choice was made. */
  decidedAt: Date;
}

/**
 * The signed-in user's recorded choice, for Settings. Null when they have not
 * chosen yet, which means only strictly necessary cookies apply.
 */
export async function getConsent(): Promise<StoredConsent | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { consentAnalytics: true, consentMarketing: true, consentAt: true },
  });
  if (!user?.consentAt) return null;
  return {
    analytics: user.consentAnalytics ?? false,
    marketing: user.consentMarketing ?? false,
    decidedAt: user.consentAt,
  };
}
