# Google sign-in: what is tested, and what is still to check

Status of the real round trip against Google: **not verified yet**. It stays that way until someone signs in with real keys and observes a real callback (checklist below).

What is verified is our side of the wire. An automated test drives the app from the "Continue with Google" button to a working session, against a fake Google that lives inside the test.

## What the automated test covers

Test: `tests/integration/google-signin.test.ts`. Helpers: `tests/integration/helpers/fake-google.ts` and `tests/integration/helpers/browser.ts`.

| Real in the test | Replaced in the test |
|---|---|
| The server actions `oauthSignInAction`, `completePendingOAuthAction`, `loginAction`, `logoutAction` | Google: consent screen, discovery document, keys, token endpoint. The fake checks the client secret, the redirect URI (it accepts only the two listed at the end of this page), one-time codes and the PKCE secret, then signs an ID token with its own RSA key |
| The Auth.js handlers of `src/app/api/auth/[...nextauth]/route.ts` and `src/app/api/session/reset/route.ts`, called with `Request` objects | The browser: a cookie jar that applies path, expiry and SameSite rules and never follows a redirect by itself |
| `src/auth.ts` (signIn, jwt, session callbacks), the signed intent and pending cookies, `resolve-oauth-user.ts` | `next/headers` and the cookie round trip of a server action |
| The database: users, accounts, audit entries and mandates are written to Postgres | `@/i18n/navigation`, which does not load under Vitest with the current configuration. Reached only on refusal paths of the two OAuth actions |

Anti-forgery values Auth.js really uses for this provider: **`state` and PKCE (`code_challenge`, method `S256`)**. Each has an HttpOnly, SameSite=Lax cookie sealed with `AUTH_SECRET` (`authjs.state`, `authjs.pkce.code_verifier`). A nonce is absent: the app does not send one, and an ID token that carries one is refused. The scope string sent is `openid profile email`, with `prompt=select_account`.

| # | Case | What is asserted |
|---|---|---|
| 1 | Pressing the button | Redirect to Google's authorization endpoint with `response_type=code`, our client id, `redirect_uri` = `<AUTH_URL>/api/auth/callback/google`, scopes openid, email, profile, `state`, PKCE. State, PKCE, callback-url and intent cookies are HttpOnly. The intent cookie is signed and scoped to `/api/auth`. The client secret is absent from the URL |
| 2 | New talent from a signup page | One User (TALENT, email verified, no password, page language), one Account keyed by Google's `sub` with no token stored, one `user.signup` audit entry, an HttpOnly session cookie, and `/api/auth/session` returns that user. The code is exchanged once, with the redirect URI and the PKCE secret |
| 3 | Same person again, other device | Same User, still one User and one Account, `Account.lastUsedAt` moves, no second audit entry |
| 4 | Replayed return link | Same browser, another browser, and the original cookies put back: each ends on `/connexion?error=Configuration`. The database gains no row, and the earlier session still works |
| 5 | Wrong state, link from another browser, missing state cookie, missing PKCE cookie, PKCE secret from another attempt | Each is refused with an error code and an empty body, with no user and no session cookie. Google is asked for a token only in the last one, and refuses |
| 6 | Cancel on Google's screen | `/connexion?error=OAuthCallbackError`, nothing created, and a new attempt right after works |
| 7 | Gmail address that already has a password account | Same account, no second User, password removed, `sessionsValidAfter` set, active mandate revoked, audit `auth.oauth.link_takeover`, and the old password is refused by the login form |
| 8 | yahoo.com address vouched by Google, existing account | `/es/connexion?error=oauthLinkRequiresPassword`, account row unchanged, no Account, no audit entry, password still works |
| 9 | `email_verified: false` | `/fr/connexion?error=oauthEmailUnverified`, nothing created |
| 10 | Bad ID token: wrong audience, expired, wrong issuer, unexpected nonce, unsigned, signed with a shared secret | Each is refused, nothing created, no session |
| 11 | New person from the sign-in page | The account is not created yet: redirect to `/en/continuer?choose=1`, pending cookie HttpOnly and signed. Choosing casting director creates the account and a second trip to Google opens the session. A hand-edited pending or intent cookie is ignored. A parked identity never joins an account created in the meantime |
| 12 | Landing page pointed at another site (`callbackUrl` on the return link, edited cookie, hostile form fields, raw sign-in route, reset route) | The redirect never leaves our origin. A web address on another site becomes the home page. A value starting with a slash is appended to our origin. A value that is not a web address makes Auth.js answer status 500 with a fixed JSON sentence, and nobody is signed in |
| 13 | Session opened before a takeover | Refused on its next request, cookie removed. The session opened by the takeover itself stays valid. `/api/session/reset` clears the stale cookie and redirects to `/<locale>/connexion` |
| 14 | Signed out | `/api/auth/session` returns no user. A made-up cookie, or one sealed with another secret, opens nothing and is removed |
| 15 to 22 | Extras | Unconfigured provider refused. Cross-site post to the raw sign-in route refused (`MissingCSRF`). Workspace address (`hd` claim) joins like Gmail. Reload keeps the session. Sign-out clears it. A deleted account loses its session. Every outside call in the run went to the fake |

### One accepted limit, one gap closed

- **10g: the signature of the ID token is not checked, by design.** Auth.js validates the claims and the algorithm named in the header, and trusts the token because the app fetched it from Google's token endpoint over TLS. OpenID Connect Core (section 3.1.3.7) allows exactly this for the code flow. Google's public keys are never downloaded. A forged token would need a broken TLS connection to Google to reach the app. The test pins this behavior so that a change in the library shows up.
- **10i: a refused token's claims stay out of the server log.** The default Auth.js logger printed the details of the error, which include the email, name and Google id from the token. `src/auth.ts` now sets its own logger, which prints the kind of error and a machine code only. The test checks that the email and name never reach the log.

### Behavior worth knowing

- Auth.js refusals arrive as `/connexion?error=<Code>` with no language prefix. `Configuration` covers state, PKCE and token problems, and `OAuthCallbackError` covers Cancel. The page maps both to the generic message. The prefix is added by `src/proxy.ts`, which this test does not run.
- After a refusal the one-time cookies stay in the browser until they expire (15 minutes, 10 for the intent cookie). They do not block a new attempt.

## How to run it

It needs a local Postgres with the migrations applied. Google keys are not needed: the test makes up dummy values for each run.

```sh
DATABASE_POOL_MAX=1 DATABASE_URL='postgres://postgres:postgres@localhost:51218/template1?sslmode=disable' \
  ./node_modules/.bin/vitest run tests/integration/google-signin.test.ts
```

Replace the URL with your own local database if it differs. Expected result: 53 passed, 2 expected failures, in about four seconds.

The suite is skipped when `DATABASE_URL` is missing or points at a host other than `localhost`, so it can never write test rows to a hosted database. Every row it creates starts with `test-google-flow-` and is removed before and after the run.

## What it cannot cover

- The real Google consent screen and account chooser.
- Whether the redirect URIs are registered in the Google console exactly as written below.
- The publishing status of the consent screen. In Testing mode only listed test users can sign in.
- Google's real token endpoint and discovery document.
- Cookie behavior in a real browser: SameSite, Secure, tracking protection. The test runs over http, with cookies named `authjs.*` and `agental.*`. Production uses https, the `__Secure-` names, and a callback-url cookie set to SameSite=None.
- The pages themselves: the message shown on `/connexion`, the routing done by `/continuer` (dashboard or onboarding), and the language prefix added by `src/proxy.ts`.
- The transport of a server action. The test calls the action and plays the cookie round trip.
- Mobile viewport and the look of the button.
- Apple.

## Manual round trip, once the keys are set

Status: **not verified yet**. Run it locally first (`http://localhost:3000`), then on production after the redeploy. Write down the date, the environment and the result of each line.

1. **First login.** Talent signup page, Continue with Google, an address with no account. Expected: Google's screen names Agental, then talent onboarding. In the database: one User with a verified email, one Account.
2. **Return login.** Sign out, then Continue with Google from the sign-in page. Expected: same account, straight to its next step, no "talent or casting director" question.
3. **Refresh.** Reload the page, then close and reopen the tab. Expected: still signed in.
4. **Sign-out.** Expected: back on the public site, and the dashboard address redirects to sign-in.
5. **Protected route while signed out.** Open `/en/talents/app` in a private window. Expected: the sign-in page.
6. **Cancel.** Press Cancel on Google's screen. Expected: the sign-in page, in your language, with the generic Google or Apple error message.
7. **Existing email.** Create an account with email and password on a Gmail address, sign out, then Continue with Google with that address. Expected: the same account, and the old password no longer works.
8. **New address from the sign-in page.** Expected: the "talent or casting director" screen, then one more quick pass through Google.
9. **On a phone.** Repeat steps 1 and 2 in Safari on iOS and Chrome on Android.

## Environment variables

Names only. Values go from the Google console straight into Vercel.

| Name | Used for | Where it is set |
|---|---|---|
| `AUTH_GOOGLE_ID` | Google client id. The button appears when this and the secret are set | Vercel, Production (Preview only to try a preview). `.env` locally |
| `AUTH_GOOGLE_SECRET` | Google client secret | Same places |
| `AUTH_SECRET` | Seals the session, state and PKCE cookies, signs the intent and pending cookies | Vercel, every environment. `.env` locally |
| `AUTH_URL` | The public address used to build the redirect URI | Vercel, Production only (`https://www.agental.co`). Leave it out of Preview and of local `.env` |
| `DATABASE_URL` | The database the app and the test use | Vercel. `.env` locally. On the command line for the test |
| `DATABASE_POOL_MAX` | Connection cap, `1` for the local test database | On the command line for the test. Unset in production |

In the test, the four `AUTH_*` values are dummies set by the test file itself, with `AUTH_URL=http://localhost:3000`.

## Redirect URIs to register with Google

From `docs/OAUTH_SETUP.md`, in the OAuth client's "Authorized redirect URIs":

- Production: `https://www.agental.co/api/auth/callback/google`
- Local: `http://localhost:3000/api/auth/callback/google`

Authorized JavaScript origin: `https://www.agental.co`.
