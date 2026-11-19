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
| 1 | Send a signed-in visitor from any public page to their own dashboard | In `src/proxy.ts` or a server check in the `(site)` layouts: session present, then redirect to `appHome(kind, locale)` | F2.1 | open |
| 2 | First sign-in goes to profile completeness, later ones to the dashboard | `User.onboardingCompletedAt: DateTime?`; `appHome` returns `/talents/app/profil` while it is null; a server action `completeOnboarding()` sets it | F4.1, F4.2 | open |
| 3 | Student discount | `redeemStudentCode({ code: string })` returning `{ ok: true }` or an error key (`invalid`, `expired`, `used_up`, `rate_limited`). Six digits, checked on the server only, rate limited, expiry and usage cap per code, discount applied in billing | F4.3 | open |
| 4 | Password rules on the server | `signupAction` and the reset action reject passwords under 8 characters, without an uppercase letter or without a special character, with one error key per rule | F5.1 | open |
| 5 | Email verification | Sign-up creates an unverified account and sends a link; `resendVerification()` with a 60-second cooldown; unverified users are kept out of the app; Google and Apple sign-ins skip it | F5.2 | open |
| 6 | Forgot password | `requestPasswordReset({ email })` always answers the same way; `resetPassword({ token, password })` returns ok or an error key (`invalid_token`, `expired`, rule keys from #4) | F5.3 | open |
| 7 | CAPTCHA and sign-up rate limits | A public site key in env when enabled; the server verifies the token in `signupAction`, `loginAction` and #6; `rate_limited` error key | F5.4 | open |
| 8 | Cookie consent storage | `saveConsent({ analytics: boolean, marketing: boolean })` on the user when signed in; a first-party cookie before that. `src/components/analytics.tsx` loads nothing before consent | F5.5 | open |
| 9 | Plan change from the plan badge | The modal reuses the action behind `plan-selector.tsx` and `casting-plan-selector.tsx`. Real checkout (Stripe) is not wired: billing is the mock provider | F3.4 | open |
| 10 | Save a recording to profile media or to the Reel & Self-tape library | `saveSelfTape({ ..., destination: "profile" | "library" })`; uploads report progress, which needs the presigned flow in `docs/MEDIA_HOSTING.md` | F6.1 | open |
| 11 | Route rename `self-tape` to `reel-self-tape` with a redirect | A redirect in `next.config.ts` or `src/proxy.ts` | F6.1 | open |
| 12 | Career figures | `carriere/page.tsx` shows Roles booked, Gross fee and Net received. The commission line is removed from the page; whether `commissionCents` stays in the data model is a backend and business call | F6.2 | open |

## Conflicts

None recorded yet.

## Notes from the backend session

(The backend session writes here, or in the shared notes folder, what `feat/auth-onboarding` already covers.)
