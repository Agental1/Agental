# Front-end / backend handoff

Shared between the front-end session (branch `frontend-redesign`) and the backend session (branch `feat/auth-onboarding`, worktree `Agental-backend`). Check this file before building anything server-side for the UI: it may already exist.

Status values: **open** (nobody has built it), **in progress**, **done** (name the branch or commit), **conflict** (both sides need the same file or the schema differs from what the UI expects).

## File ownership while both sessions are active

| Front end | Backend |
|---|---|
| `src/app/globals.css`, `src/components/ui`, `src/components/marketing`, `src/components/brand`, the `(site)` pages and layouts, the entry page, Limelight, `src/components/app/app-sidebar.tsx`, icons and manifest, `/brand` | `prisma/`, `src/auth.ts`, `src/app/actions/*`, `src/domain/*`, `src/lib/*`, `src/components/onboarding/*`, `src/components/app/profile-editor.tsx` |

Files both sides need. The front end restyles these through CSS and shared components and holds direct edits until `feat/auth-onboarding` is pushed:

- `src/app/[locale]/(auth)/connexion/page.tsx`
- `src/app/[locale]/talents/(flow)/inscription/page.tsx`, `src/app/[locale]/casting/(flow)/inscription/page.tsx`
- `src/app/[locale]/talents/(space)/app/page.tsx`, `.../app/profil/page.tsx`
- `messages/*/{app,casting,talents}.json`: the front end adds or edits public-site keys only; signed-in keys wait for the backend branch.

## Requests

| # | Needed | Proposed contract | Task | Status |
|---|---|---|---|---|
| 1 | Send a signed-in visitor from any public page to their own dashboard | Redirect to `/[locale]/continuer`, which already picks the dashboard or the unfinished wizard (`postAuthHome`) | F2.1 | route exists on `feat/auth-onboarding`; the redirect itself is front-end work after the rebase |
| 2 | First sign-in goes to profile completeness, later ones to the dashboard | `User.onboardingCompletedAt: DateTime?`; `appHome` returns `/talents/app/profil` while it is null; a server action `completeOnboarding()` sets it | F4.1, F4.2 | partly: `/talents/app?welcome=1` after the mandate is the first-run signal for now; the stored column is a proposed follow-up migration |
| 3 | Student discount | `redeemStudentCode({ code: string })` returning `{ ok: true }` or an error key (`invalid`, `expired`, `used_up`, `rate_limited`). Six digits, checked on the server only, rate limited, expiry and usage cap per code, discount applied in billing | F4.3 | open, waits on Stripe and a pricing decision; UI builds against `redeemStudentCode(code)` with `TODO(backend)` |
| 4 | Password rules on the server | `signupAction` and the reset action reject passwords under 8 characters, without an uppercase letter or without a special character, with one error key per rule | F5.1 | in progress on `feat/auth-onboarding`: `passwordChecks(password)` exported from `src/domain/auth.ts`, shared by the checklist and the server; keys `errors.passwordNeedsUppercase`, `errors.passwordNeedsSpecial` |
| 5 | Email verification | Sign-up creates an unverified account and sends a link; `resendVerification()` with a 60-second cooldown; unverified users are kept out of the app; Google and Apple sign-ins skip it | F5.2 | open, blocked on the email sender (Resend key and DNS for agental.co) |
| 6 | Forgot password | `requestPasswordReset({ email })` always answers the same way; `resetPassword({ token, password })` returns ok or an error key (`invalid_token`, `expired`, rule keys from #4) | F5.3 | open, same blocker as #5 |
| 7 | CAPTCHA and sign-up rate limits | A public site key in env when enabled; the server verifies the token in `signupAction`, `loginAction` and #6; `rate_limited` error key | F5.4 | open; plan is Cloudflare Turnstile, shown only when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set |
| 8 | Cookie consent storage | `saveConsent({ analytics: boolean, marketing: boolean })` on the user when signed in; a first-party cookie before that. `src/components/analytics.tsx` loads nothing before consent | F5.5 | open. Known today: the server sets strictly necessary cookies only (Auth.js session, CSRF, callback, OAuth state, `agental.oauth-intent`, `agental.pending-oauth`, `NEXT_LOCALE`); analytics is Plausible, cookieless, off unless `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is set |
| 9 | Plan change from the plan badge | The modal reuses the action behind `plan-selector.tsx` and `casting-plan-selector.tsx`. Real checkout (Stripe) is not wired: billing is the mock provider | F3.4 | done on `main`: `upgradeTalentPlan(plan)` and `changeOrgPlan(plan)` in `src/app/actions/subscription.ts` return `{ ok, error?, checkoutUrl? }`; paid plans answer `errors.billingUnavailable` in production on purpose |
| 10 | Save a recording to profile media or to the Reel & Self-tape library | `saveSelfTape({ ..., destination: "profile" | "library" })`; uploads report progress, which needs the presigned flow in `docs/MEDIA_HOSTING.md` | F6.1 | partly: `saveSelfTape(formData)` exists without a destination (profile = `VIDEO`, library = `SELFTAPE`). UI builds against `uploadMedia(file, { type, destination, onProgress })`; the backend supplies its body with direct-to-storage uploads |
| 11 | Route rename `self-tape` to `reel-self-tape` with a redirect | A redirect in `next.config.ts` or `src/proxy.ts` | F6.1 | open; the front end tells the backend the new segment (`revalidatePath` in `src/app/actions/selftape.ts`) |
| 12 | Career figures | `carriere/page.tsx` shows Roles booked, Gross fee and Net received. The commission line is removed from the page; whether `commissionCents` stays in the data model is a backend and business call | F6.2 | open |

## Conflicts

None recorded yet.

## Agreed between the two sessions (2026-11-18)

- The full backend status lives in `~/Downloads/agental-workflows/shared-notes/BACKEND_STATUS.md`; a copy of this file sits beside it.
- `feat/auth-onboarding` is pushed first. `frontend-redesign` is rebased on it before the front end edits the overlapping pages, then `bun run i18n:check` runs.
- The backend leaves `globals.css`, the header, the footer, the `(site)` pages, logos and favicon alone.
- Token names are stable: `text-fg`, `text-fg-muted`, `bg-border`, `bg-surface-2`, `ring-ring`, `ring-offset-bg`, `rounded-sedan` and `--btn-radius` all still exist. What changed underneath: `rounded-sedan` is 12px, `--btn-radius` is a pill in both themes, `text-accent` reads `--accent-ink` (darker blue on Talent, lighter on Casting) while `bg-accent` stays `#246BFE`, `h1` to `h3` are always bold, and `font-mono` and `font-display` are aliases of the Helvetica stack. New helpers: `.pressable` (hover and press scale for anything clickable), `.cta-fill` (the primary gradient), `.accent-wash`, `.enter`.
- `OAuthButtons` gets `tone="dark"` on Casting pages; Google and Apple colors stay out of the theme.
- Date of birth stays in the sign-up wizard (adults only, checked on the server). The wizard has three steps: identity, profile, mandate.
- Phase 8: `AuditLog`, `/admin` and `/admin/audit` exist. No new schema is designed before talking to the backend session.

## Front-end changes the backend branch will meet at rebase (2026-11-18, late)

- `src/components/app/app-sidebar.tsx` is gone. The three signed-in layouts (`talents/(space)`, `casting/(space)`, `admin`) render `AppShell` from `src/components/app/app-shell.tsx` (sidebar from 768px, sticky top bar and menu sheet below). `AppNavItem` is exported from there.
- The plan badge lives in the shell, top right, on every app page: `src/components/app/plan-switcher.tsx` calls `upgradeTalentPlan` and `changeOrgPlan`. The Talent layout now reads `prisma.subscription` and the Casting layout includes `organization` on the membership it already loads. The static "Plan Free" badge on `talents/(space)/app/page.tsx` can go when that page is reconciled.
- Plan prices are formatted by `formatPlanPrice` in `src/lib/plan-price.ts` (US dollars), on public pages and in the app.
- `src/data/portraits.ts`, `src/assets/portraits`, `src/assets/fonts`, `tests/data/portraits.test.ts`, `tools/assets/portraits.ts`, `src/components/talents/join-steps.tsx` and `scroll-motion.tsx` are deleted; `package.json` lost the `assets:portraits` script and `CastingType` lost `ageBand`.
- `AgentalLogo` no longer takes a `mark` prop; it always draws the A monogram.
- New message groups: `common.entry.{line,createTalents,createCasting}`, `common.pricing.details`, `common.app.*`. The signed-in pages gain keys under `talents.space.*`, `casting.space.*` and `app.*` for strings that were hard-coded (F3.6).
- Radix portals render outside the themed root, so a dialog used in the Casting app needs `data-portal="casting"` on its content to get the dark theme (see `plan-switcher.tsx`).

## Round 2 split and contracts (agreed 2026-11-19)

The backend session takes all server work for round 2 on `feat/round2-server` (stacked on `feat/auth-onboarding`, merged into `frontend-redesign` slice by slice). The front end creates no migrations, buckets or policies.

Where the app differs from the round 2 brief, by agreement:
- Storage stays on the private Cloudflare R2 bucket, behind `uploadMedia`.
- Google and Apple run on Auth.js. `OAuthButtons` renders nothing when a provider has no keys, so no public "enabled" flag is needed. `docs/OAUTH_SETUP.md` is written by the backend session with the Auth.js callback URLs.
- A password account and a later Google sign-in with the same email reach the same account (linking, with safeguards).

| Area | Contract the UI builds against | UI task |
|---|---|---|
| Uploads (E2) | `uploadMedia(file, { type, destination?, durationSec?, metrics?, onProgress?, signal? })` in `src/lib/media-upload.ts`, returning `{ ok: true, mediaId }` or `{ ok: false, error }`; `deleteRecording(mediaId)` in `src/app/actions/uploads.ts`; `listRecordings(profileId, { destination? })` in `src/lib/recordings.ts` (each with `url` = `/api/media/<id>`, never public); limits in `UPLOAD_LIMITS` (`src/domain/uploads.ts`: video 150 MB, photo 15 MB); errors `uploadTooLarge`, `uploadTypeNotAllowed`, `uploadQuota`, `uploadFailed`. Pass the recorder's real blob type. | E1, E3 |
| First run (F4.1) | `User.onboardingCompletedAt`; first landing is `/talents/app/profil?welcome=1` (casting: `/casting/app?welcome=1`); `completeFirstRun()` in `src/app/actions/onboarding.ts`. Show the tutorial when `?welcome=1` is present. | F4.2 |
| Consent (B2) | `saveConsent({ analytics, marketing })` in `src/app/actions/consent.ts`; `getConsent()` in `src/lib/consent.ts`. Before an account exists: first-party cookie `agental.consent` holding `{"v":1,"analytics":false,"marketing":false}`; sign-up copies it onto the user. | B2 |
| Student code (F4.3) | `redeemStudentCode(code)` in `src/app/actions/student.ts`; errors `studentCodeInvalid`, `studentCodeExpired`, `studentCodeUsedUp`, `tooManyAttempts`. Needs a signed-in user: keep the typed code at sign-up and call it once the account exists. | F4.3 |
| Limelight (D5) | In `src/app/actions/sites.ts`: `saveSite({ siteId?, template, content })`, `startSiteCheckout({ siteId, offer })` (mock billing: `billingUnavailable` in production, paid at once in dev), `publishSite(siteId)`, `requestStudentPrice()`, `decideStudentPrice(requestId, decision)`. Plan and Pro end date through `getTalentPlan(userId)` in `src/lib/billing/entitlement.ts`. Prices, the 4 months and `studentPriceUsd` (null until set) come from `LIMELIGHT`. | D1 to D4 |
| Emails (B1) | `requestEmailVerification()`, `verifyEmail(token)`, `requestPasswordReset(email)`, `resetPassword(token, password)` in `src/app/actions/account-email.ts`. Emails are logged, not sent, until `RESEND_API_KEY` exists. Last slice. | F5.2, F5.3 |

n8n stays unconnected in this round; the Limelight request webhook contract is the existing one in `src/app/actions/limelight.ts`.

For the G3 deploy, the backend session is adding a guarded step that applies pending Prisma migrations during production builds. Nobody runs SQL by hand.
