# Sign in with Google and Apple: setup

The code is in place. Each button appears on its own as soon as that provider's keys exist in the environment, and stays hidden otherwise, so a half-configured provider never shows a broken button. There is no separate on/off flag to set.

This page lists what a founder has to do once, in Google, Apple and Vercel. Nobody else can do it: it needs your developer accounts, and the secrets must go straight from Google and Apple into Vercel.

## How it works here

Sign-in runs on Auth.js inside the app (`src/auth.ts`). Supabase Auth is not used, so nothing is configured in the Supabase dashboard and the callback URLs are on our own domain:

| Provider | Callback URL to register |
|---|---|
| Google | `https://www.agental.co/api/auth/callback/google` |
| Apple | `https://www.agental.co/api/auth/callback/apple` |

The site's canonical host is `www.agental.co`. Register the `www` form exactly as written.

## 1. Google (about 15 minutes, free)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign in with the company Google account.
2. Create a project named `Agental`.
3. Open **APIs & Services → OAuth consent screen**. Choose **External**. Fill in: app name `Agental`, user support email, authorized domain `agental.co`, the privacy policy and terms URLs, developer contact email. Scopes: `openid`, `email`, `profile` (the defaults).
4. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**. Application type: **Web application**.
   - Authorized JavaScript origins: `https://www.agental.co`
   - Authorized redirect URIs: `https://www.agental.co/api/auth/callback/google`
   - For local testing, also add `http://localhost:3000/api/auth/callback/google`.
5. Copy the **Client ID** and **Client secret** into Vercel (step 3 below) as `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
6. Back on the consent screen, click **Publish app** so it leaves "Testing" mode. In Testing mode only the test users you list can sign in.

## 2. Apple (about 30 minutes, needs a paid membership)

Apple requires an [Apple Developer Program](https://developer.apple.com/programs/) membership (99 USD per year). Enroll as the company if you can; a personal enrollment shows your own name on the consent screen.

In **Certificates, Identifiers & Profiles**:

1. **Identifiers → App IDs → +**. Type: App. Description `Agental`, Bundle ID such as `co.agental.app`. Tick **Sign in with Apple**. Save.
2. **Identifiers → Services IDs → +**. Description `Agental Web`, identifier such as `co.agental.web`. Save, open it, tick **Sign in with Apple**, click **Configure**:
   - Primary App ID: the one from step 1.
   - Domains: `www.agental.co`
   - Return URLs: `https://www.agental.co/api/auth/callback/apple`
   - Save. The Services ID (`co.agental.web`) is the value for `AUTH_APPLE_ID`.
3. **Keys → +**. Name `Agental Sign in`, tick **Sign in with Apple**, configure it with the App ID from step 1, and register. **Download the `.p8` file now: Apple offers it once.** Note the **Key ID**.
4. Note your **Team ID** (top right of the developer site, or under Membership).
5. In Vercel (step 3 below) set:
   - `AUTH_APPLE_ID` = the Services ID
   - `AUTH_APPLE_TEAM_ID` = the Team ID
   - `AUTH_APPLE_KEY_ID` = the Key ID
   - `AUTH_APPLE_PRIVATE_KEY` = the whole contents of the `.p8` file, including the BEGIN and END lines

With those four values the app signs Apple's client secret itself and renews it every day, so there is no six-month expiry to track. (The alternative, pasting a pre-made secret into `AUTH_APPLE_SECRET`, expires after at most six months and then breaks sign-in until someone regenerates it. Leave that variable empty.)

Apple accepts `https` return URLs on fixed domains only. It cannot be tested on `localhost` or on Vercel preview links.

### Hide My Email

People who choose "Hide My Email" give us a relay address ending in `@privaterelay.appleid.com`. Apple delivers mail to it only from senders you registered. Before the first email goes out to such a user: **Services → Sign in with Apple for Email Communication → +**, and register the sending domain and address used with the email provider (for example `agental.co` and `contact@agental.co`), with SPF and DKIM in place.

## 3. Vercel

Project `agental` → **Settings → Environment Variables**. Add the variables to the **Production** environment:

| Variable | Value |
|---|---|
| `AUTH_URL` | `https://www.agental.co` (Production only, never Preview) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | from Google |
| `AUTH_APPLE_ID`, `AUTH_APPLE_TEAM_ID`, `AUTH_APPLE_KEY_ID`, `AUTH_APPLE_PRIVATE_KEY` | from Apple |

Redeploy production. The buttons appear on the sign-in page and on both sign-up pages.

To try Google on a preview deployment, add the Google variables to the Preview environment too and register that preview's callback URL in Google. Leave `AUTH_URL` out of Preview.

## What a person goes through

- **New here, clicked the button on a sign-up page**: the account is created as a talent or a casting account, matching the page, then the usual onboarding. The provider already verified the email, so there is no "check your inbox" step.
- **New here, clicked the button on the sign-in page**: one extra screen asks "talent or casting director", then the same path.
- **Already has an account with that email**: they land on that same account. There is never a second account for one email. The details follow.

### Same email, two ways to sign in

Signing up with email and a password has never verified the address. Someone could register another person's email in advance, set a password and wait. So when Google or Apple arrives with an email that already has an account, the app joins the two, and what happens next depends on whether that account's email was ever proven:

| The existing account | What happens |
|---|---|
| Was created with Google or Apple already | The new provider is added. Nothing else changes. |
| Was created with a password, never proven | The provider's owner gets the account. Its old password is removed, every session opened before is ended, and a signed mandate has to be signed again. The person signs in with the provider from then on. |

Two cases are refused with a message that asks the person to sign in with their email and password:

- Google vouches for an address it does not host (a Yahoo or Outlook address on a Google account). Google only proves ownership for Gmail and Google Workspace addresses.
- Two old accounts differ only by letter case in their email. This cannot happen once stored emails are normalized (migration `20261120000000_normalize_user_emails`).

Apple relay addresses never match an existing account, so a "Hide My Email" user always gets a new one.

Every join is written to the audit log (`auth.oauth.link` or `auth.oauth.link_takeover`).

## Check that it works

On production, after the redeploy:

1. Google from the talent sign-up page with a new address: lands in onboarding as a talent.
2. Sign out, Google again from the sign-in page: lands on the dashboard.
3. Google from the sign-in page with an address that has no account: the "talent or casting director" screen appears.
4. Apple in Safari and in Chrome, once with a real address and once with Hide My Email.
5. An address that already has a password account: lands on that account, and the old password no longer works.
6. Remove one provider's variables and redeploy: its button disappears and the other keeps working.

## Turning a provider off

Delete its variables in Vercel and redeploy. Accounts created with that provider stay in the database and work again when the variables return. To revoke access on the provider side: Google Cloud → Credentials → delete the client; Apple → Keys → revoke the key.
