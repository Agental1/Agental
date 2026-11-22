import { getTranslations } from "next-intl/server";
import type { Locale } from "next-intl";
import { Link2 } from "lucide-react";
import { enabledOAuthProviders } from "@/auth";
import { oauthSignInAction } from "@/app/actions/oauth";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";

/**
 * Settings > Connected accounts.
 *
 * Tells the person what is linked to their account, in plain words: the ways
 * they can sign in, what each one shares, and how to add one. Google is an
 * identity connection only: it signs the person in and nothing else. Platform
 * service accounts and provider errors belong in the admin area, never here.
 *
 * Only what the app really implements is listed. Tokens, provider account ids
 * and anything else that works as a secret are never read into this view.
 *
 * TODO(backend): a `disconnectProvider(provider)` action that refuses to
 * remove the last way to sign in; the row then gains a Disconnect button.
 */
export async function ConnectedAccounts({
  userId,
  locale,
  embedded = false,
}: {
  userId: string;
  locale: Locale;
  /** Inside another section (Settings > Account): no card, no title of its own. */
  embedded?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "common.connected" });
  const [user, accounts] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } }),
    prisma.account.findMany({ where: { userId }, select: { provider: true } }),
  ]);

  const googleEnabled = enabledOAuthProviders.includes("google");
  const googleLinked = accounts.some((a) => a.provider === "google");
  const hasPassword = Boolean(user?.passwordHash);

  const rows = [
    {
      key: "password",
      name: t("password"),
      what: t("passwordWhat"),
      status: hasPassword ? t("connected") : t("notConnected"),
      on: hasPassword,
      detail: null as string | null,
      action: null as React.ReactNode,
    },
    {
      key: "google",
      name: t("google"),
      what: t("googleWhat"),
      status: googleLinked ? t("connected") : googleEnabled ? t("notConnected") : t("unavailable"),
      on: googleLinked,
      detail: t("permissions"),
      action:
        googleEnabled && !googleLinked ? (
          <form action={oauthSignInAction}>
            <input type="hidden" name="provider" value="google" />
            <input type="hidden" name="mode" value="signin" />
            <input type="hidden" name="locale" value={locale} />
            <button
              type="submit"
              className="pressable inline-flex h-11 items-center rounded-full border border-border-strong bg-surface px-5 text-[14.5px] font-bold"
            >
              {t("connect")}
            </button>
          </form>
        ) : null,
    },
  ];

  return (
    <section
      id="connected-accounts"
      className={cn("scroll-mt-24", !embedded && "rounded-sedan-xl border border-border bg-surface p-5")}
    >
      {embedded ? (
        <h3 className="text-sm font-medium">{t("title")}</h3>
      ) : (
        <h2 className="flex items-center gap-2 text-[1.125rem]">
          <Link2 aria-hidden="true" className="size-5 text-accent" />
          {t("title")}
        </h2>
      )}
      <p className="mt-1 max-w-[60ch] text-[15px] text-fg-muted">{t("lead")}</p>

      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row.key} className="rounded-sedan border border-border px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <p className="font-bold">{row.name}</p>
              <p className={cn("text-[14px] font-bold", row.on ? "text-success" : "text-fg-muted")}>{row.status}</p>
            </div>
            <p className="mt-1 max-w-[62ch] text-[14px] leading-snug text-fg-muted">{row.what}</p>
            {row.detail && <p className="mt-1 text-[13px] text-fg-subtle">{row.detail}</p>}
            {row.action && <div className="mt-3">{row.action}</div>}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] text-fg-subtle">
        {t("keepOne")} {t("none")}
      </p>
    </section>
  );
}
