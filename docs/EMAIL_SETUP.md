# Email verification and password reset: setup

The code is in place and stays quiet until it is configured. While `RESEND_API_KEY` or `EMAIL_FROM` is missing, the site sends no email at all: each message becomes one line in the server log (subject and recipient domain only in production; in local development the line also carries the text with its link, so a developer can click it).

This page lists what a founder does once, in Resend, at the DNS host and in Vercel. It takes about 20 minutes plus the time DNS needs.

## 1. Resend: the API key

1. Create an account at [resend.com](https://resend.com) with the company email.
2. Open **API Keys → Create API Key**. Name it `agental-production`, permission **Sending access**. If the domain from step 2 is already added, limit the key to it.
3. Copy the key now: Resend shows it once. It goes straight into Vercel (step 3) and nowhere else.

## 2. Verify the sending domain

Resend only sends from a domain you have proven you own.

1. In Resend, open **Domains → Add Domain** and enter `agental.co`.
2. Resend shows a list of DNS records. Add each one at the DNS host of `agental.co` (the place where the domain's records are managed), copied exactly as shown:
   - **SPF**: an MX record and a TXT record on a `send` subdomain. They authorize Resend to send for the domain.
   - **DKIM**: a TXT record whose name ends in `._domainkey`. It signs every message.
   - **DMARC** (optional, recommended): a TXT record named `_dmarc`. Start with `v=DMARC1; p=none;` and tighten it later.
3. Back in Resend, click **Verify**. It turns green within minutes, sometimes a few hours.

Existing MX records for the company mailbox stay untouched: the new ones live on the `send` subdomain.

## 3. Vercel

Project `agental` → **Settings → Environment Variables**, **Production** environment:

| Variable | Value | When empty |
|---|---|---|
| `RESEND_API_KEY` | the key from step 1 | Emails are logged, none is sent |
| `EMAIL_FROM` | `Agental <no-reply@agental.co>`, on the verified domain | Same: sending needs both |

Redeploy production. Links in the emails are built from `NEXT_PUBLIC_SITE_URL`, then from `AUTH_URL`, which production already has (see `OAUTH_SETUP.md`), so they point at `https://www.agental.co`.

**Round 11: the gate is a switch in Admin > Controls**, "Email verification required before the dashboard", off by default. While it is on (and email can be sent), an email and password account must enter the 6-digit code before any app page, after sign-up and at every sign-in until it is done; Google and Apple accounts pass. Turn it on only once a sign-up code has really arrived on production. `EMAIL_VERIFICATION_REQUIRED_SINCE` is no longer read (it used to switch the gate on by itself as soon as a Resend key existed); it can be deleted from Vercel.

Leave the three variables out of the Preview environment. A preview then sends nothing, and a request for a confirmation email answers "could not be sent".

## What the code does

All of it is in `src/app/actions/account-email.ts`.

| Action | Who calls it | What it does |
|---|---|---|
| Sign-up (`signupAction`) | the sign-up form | Sends the first confirmation email when a sender is configured. A mail failure never blocks the sign-up. |
| `requestEmailVerification()` | a signed-in user | Sends a new confirmation link, valid 24 hours. The previous link stops working. Google and Apple accounts answer "already verified". |
| `verifyEmail(token)` | the confirmation page | Uses the link up and marks the address as confirmed. |
| `requestPasswordReset(email)` | the "forgot password" form | Always answers the same, whether an account exists or not. With exactly one account for the address, sends a reset link valid 1 hour. |
| `resetPassword(token, password)` | the reset page | Checks the password rules, uses the link up, saves the new password, signs the account out everywhere, and marks the address as confirmed. The person then signs in with the new password. |

Each link works once. The database stores a hash of the link's token, so a copy of the database contains no usable link. Confirmations and resets are written to the audit log (`auth.email.verified`, `auth.password.reset`).

## The two pages

The emails point at two pages, which must exist in the four languages:

| Email | Link |
|---|---|
| Confirmation | `/[locale]/verifier?token=...` |
| Password reset | `/[locale]/reinitialiser?token=...` |

The path segments are exported from `src/lib/email-tokens.ts` (`VERIFY_PATH_SEGMENT`, `RESET_PATH_SEGMENT`, `TOKEN_QUERY_PARAM`). Each page should call its action from a button press, since mail scanners open every link in a message and a link works once.

## Rate limits

| What | Limit |
|---|---|
| New confirmation email, per user | 1 per 60 seconds and 5 per hour |
| Reset request, per email address | 3 per hour |
| Reset request, per IP address | 10 per hour |

A user over the confirmation limit sees "Too many attempts". A reset request over a limit gets the usual answer and sends nothing, so the form reveals nothing. The counters store keyed hashes, never an address or an IP.

## Apple "Hide My Email"

People who chose "Hide My Email" have a relay address ending in `@privaterelay.appleid.com`. Apple delivers to it only from senders registered with Apple. Before any email goes to such a user, open the Apple Developer site, **Certificates, Identifiers & Profiles → Services → Sign in with Apple for Email Communication → +**, and register `agental.co` together with the exact address used in `EMAIL_FROM`. SPF and DKIM from step 2 must already pass.

## Check that it works

On production, after the redeploy:

1. Sign up with a new address and a password: the confirmation email arrives, in the language of the sign-up page.
2. Click its button: the address is confirmed. Click the same link again: "This link is not valid."
3. Ask for a password reset for that address: the email arrives. Ask for one with an unknown address: the page answers the same and no email is sent.
4. Set a new password from the link: the old password stops working and other browsers are signed out.
5. In Resend, **Emails** shows each message as delivered. A bounce or a "domain not verified" error there points back at step 2.

## Turning it off

Turn the switch off in Admin > Controls (immediate). Or delete `RESEND_API_KEY` in Vercel and redeploy: emails stop, and the gate opens for everyone at the same moment, because it only applies while a sender is configured.
