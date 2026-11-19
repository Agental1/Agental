import { getTranslations } from "next-intl/server";
import type { Locale } from "next-intl";
import { enabledOAuthProviders } from "@/auth";
import { oauthSignInAction } from "@/app/actions/oauth";
import type { OAuthProviderId } from "@/lib/auth/oauth-providers";
import { cn } from "@/lib/utils";

/**
 * "Continue with Google / Apple", one form per provider this deployment has
 * configured. Renders nothing when none is, so pages need no condition.
 *
 * Branding follows each provider's published rules, which is why the colours
 * are literal rather than theme tokens:
 * - Google: the four-colour G on a white (#FFFFFF, border #747775, text
 *   #1F1F1F) or dark (#131314, border #8E918F, text #E3E3E3) button.
 * - Apple: the Apple logo, black on light backgrounds, white on dark ones.
 * Both buttons share one size so neither reads as the secondary choice.
 *
 * The visible text is the accessible name; the logos are decorative.
 */
export async function OAuthButtons({
  mode,
  kind,
  locale,
  namespace,
  tone = "light",
  className,
}: {
  mode: "signin" | "signup";
  kind?: "TALENT" | "CASTING";
  locale: Locale;
  /** talents (tu) or casting (vous): the register of the page. */
  namespace: "talents" | "casting";
  /** The page background: dark pages get the dark variants. */
  tone?: "light" | "dark";
  className?: string;
}) {
  if (enabledOAuthProviders.length === 0) return null;
  const t = await getTranslations({ locale, namespace });

  return (
    <div className={cn("space-y-3", className)}>
      {enabledOAuthProviders.map((provider) => (
        <form key={provider} action={oauthSignInAction}>
          <input type="hidden" name="provider" value={provider} />
          <input type="hidden" name="mode" value={mode} />
          {kind && <input type="hidden" name="kind" value={kind} />}
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className={buttonClass(provider, tone)}>
            {provider === "google" ? <GoogleLogo /> : <AppleLogo />}
            <span>{t(provider === "google" ? "oauth.google" : "oauth.apple")}</span>
          </button>
        </form>
      ))}
      <div className="flex items-center gap-3 text-xs text-fg-muted">
        <span aria-hidden className="h-px flex-1 bg-border" />
        <span>{t("oauth.or")}</span>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

function buttonClass(provider: OAuthProviderId, tone: "light" | "dark") {
  return cn(
    "inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-[var(--btn-radius)] border px-4 text-[15px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
    provider === "google" &&
      "[font-family:Roboto,Arial,sans-serif] " +
        (tone === "dark"
          ? "border-[#8E918F] bg-[#131314] text-[#E3E3E3] hover:bg-[#1f1f20]"
          : "border-[#747775] bg-white text-[#1F1F1F] hover:bg-[#f7f8f8]"),
    provider === "apple" &&
      "[font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif] " +
        (tone === "dark"
          ? "border-white bg-white text-black hover:bg-white/90"
          : "border-black bg-black text-white hover:bg-black/85")
  );
}

function GoogleLogo() {
  return (
    <svg aria-hidden focusable="false" viewBox="0 0 48 48" className="size-[18px] shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg aria-hidden focusable="false" viewBox="0 0 24 24" fill="currentColor" className="size-[18px] shrink-0">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}
