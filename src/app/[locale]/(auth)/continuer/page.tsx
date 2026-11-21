import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { cookies } from "next/headers";
// The reset route lives under /api, outside the locale tree, so the
// locale-aware redirect cannot address it.
// eslint-disable-next-line no-restricted-imports
import { redirect as nextRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { completePendingOAuthAction } from "@/app/actions/oauth";
import { readPendingCookie } from "@/lib/auth/oauth-cookies";
import { needsFirstRun, postAuthHome, type PostAuthState } from "@/domain/auth-routes";
import { getSetupState } from "@/lib/setup";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const t = await getTranslations({ locale: toLocale(rawLocale), namespace: "app" });
  return { title: t("auth.choose.metaTitle"), robots: { index: false } };
}

/**
 * Where every sign-in lands, email or provider.
 *
 * With a session: send the person to their dashboard, or back into onboarding
 * if it is unfinished (postAuthHome). With no session but a pending provider
 * identity: ask talent or casting director, then create the account. Anything
 * else goes to the sign-in page.
 *
 * The path is unprefixed in routing terms ("/continuer"); postAuthHome returns
 * locale-prefixed paths for NextAuth, so the prefix is stripped before handing
 * them to the locale-aware redirect.
 */
export default async function ContinuePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);

  const session = await auth();
  if (session?.user?.id) {
    const kind = session.user.kind;
    const state = await loadPostAuthState(session.user.id, kind);
    const target = postAuthHome(kind, locale, state);
    if (needsFirstRun(kind, state)) {
      // The first-run screen is served once: stamp it so the next sign-in
      // goes to the dashboard. Conditional, so a second tab changes nothing.
      await prisma.user.updateMany({
        where: { id: session.user.id, onboardingCompletedAt: null },
        data: { onboardingCompletedAt: new Date() },
      });
    }
    // Land in the account's language (saved from the app), not the sign-in page's.
    const saved = await prisma.user.findUnique({ where: { id: session.user.id }, select: { locale: true } });
    const home = saved?.locale && saved.locale !== locale ? toLocale(saved.locale) : locale;
    return redirect({ href: target.slice(`/${locale}`.length), locale: home });
  }

  const pending = await readPendingCookie();
  if (!pending) {
    // A session cookie with no session behind it (deleted account, or
    // sessions cut off): clear it, or the visitor keeps being sent here.
    if (await hasSessionCookie()) {
      return nextRedirect(`/api/session/reset?locale=${locale}`);
    }
    return redirect({ href: "/connexion", locale });
  }

  const t = await getTranslations({ locale, namespace: "app" });
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="font-display text-2xl font-medium">
          {t("auth.choose.title")}
        </h1>
        <p className="text-sm text-fg-muted">
          {t("auth.choose.subtitle", { email: pending.email })}
        </p>
      </div>
      <div className="space-y-3">
        {(["TALENT", "CASTING"] as const).map((kind) => (
          <form key={kind} action={completePendingOAuthAction}>
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="locale" value={locale} />
            <Button
              type="submit"
              variant={kind === "TALENT" ? "primary" : "secondary"}
              className="h-auto min-h-11 w-full flex-col items-start gap-0.5 whitespace-normal py-3 text-left"
            >
              <span>{t(kind === "TALENT" ? "auth.choose.talent" : "auth.choose.casting")}</span>
              <span className="text-xs font-normal opacity-80">
                {t(kind === "TALENT" ? "auth.choose.talentHint" : "auth.choose.castingHint")}
              </span>
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}

/** Auth.js names its session cookie with a __Secure- prefix on https. */
async function hasSessionCookie(): Promise<boolean> {
  const jar = await cookies();
  return ["authjs.session-token", "__Secure-authjs.session-token"].some(
    (name) => jar.has(name) || jar.has(`${name}.0`)
  );
}

async function loadPostAuthState(
  userId: string,
  kind: string | undefined
): Promise<PostAuthState> {
  if (kind === "CASTING") {
    const [membership, user] = await Promise.all([
      prisma.membership.findFirst({
        where: { userId, role: "OWNER" },
        select: { id: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { onboardingCompletedAt: true },
      }),
    ]);
    return {
      hasOwnerMembership: !!membership,
      onboardingCompletedAt: user?.onboardingCompletedAt ?? null,
    };
  }
  const { nextStep, onboardingCompletedAt } = await getSetupState(userId);
  return { setupStep: nextStep, onboardingCompletedAt };
}
