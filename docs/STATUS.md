# Status: v1 brief and round 2 brief

Updated 2026-11-22 (round 9). Production builds from `frontend-redesign` with pnpm. Round 9 state and everything waiting on the founder: `docs/HANDOFF.md`, "Round 9 (2026-11-22): start here", "Waiting for Jérôme".

**Production** runs v0.6.25.0, Version 57 (`live-2026-11-22-r9-g9`), still in **test mode** (`WORKFLOW_MODE` unset, both n8n workflows inactive): round 9 groups 1 (admin cleanup with 30-day restore, clickable counts, Projects, privacy), 2 part 1 (emails list, Limelight confirmation, demo accounts Test), 4 (searches through n8n, cost per provider, ceiling), 5 (Samantha and Adrian), 6 (automatic emails, staff approval, unsubscribe), 7 (replies to approve), 8 (texts behind a flag, off), 9 (pause switch, AI accounts page, `docs/GO_LIVE.md`). Group 2's sending, group 3 and every live test wait on the founder's keys and DNS. Versions 49 to 57 in `docs/RELEASES.md`.

**Production** runs v0.6.12.0, Version 43 (`live-2026-11-22-r8c-g6`): round 8c groups A, 1, 4 and 6 (numbered Preferences, Build chips, Applications buttons; pnpm, relink prompt, deep-link focus; live bell ready, daily backup ready, search rate limit, security pass; Terms draft page behind a flag). Groups 2, 3 and 5 wait on founder actions. Before that, Version 39 (end of round 8b).

**Production** (agental.co) runs v0.6.8.0, Version 39 (2026-11-22, `live-2026-11-22-r8b-g4`): round 8b groups 1 to 4 (sidebar menu button, profile fixes, saved AI agent setup, wider layout, Settings menu, dashboard Status, Applications in three search states with Accept and Decline, checkout panel with USC code verification and the beta card step). Versions are numbered in `docs/RELEASES.md` and never shown on the site. Before that, v0.6.4.0 (Version 35, `live-2026-11-22-r8-g5`): round 8 groups 1 to 5 (sidebar, profile in four tabs with autosave and one 100% rule, location and phone inputs, promotions and Limelight pricing, notification bell). Back to before round 8: `vercel promote agental-leyymorx4-agentalco.vercel.app` (`docs/ROLLBACK_R8.md`). Before that, v0.5.8.0 (2026-11-22, `live-2026-11-22-r7b-admin`): round 7b groups 1 to 4 and the admin site; Part D is set up in n8n and waits for the owner. What waits on the owner is in `docs/HANDOFF.md`, "Round 7b". Before that: v0.5.4.0, round 6 part 2 (`live-2026-11-21-r6-p2`). Earlier: release 2 (`live-2026-11-19-release2`, deployment `agental-exmsrxj64-agentalco.vercel.app`); every release is in docs/RELEASES.md. Round 2 went live on 2026-11-19, then release 1 and release 2 the same day, so the rows marked "done, local" below are now live unless their note says otherwise. Later work is tracked in `docs/HANDOFF.md`.

Status values: **done** (live), **done, local** (committed, checked locally, waiting for deploy), **partial**, **blocked**, **open**.

"Server" means work owned by the backend session; the split is in `docs/FRONTEND_BACKEND_HANDOFF.md`.

## v1 brief

| Task | Status | What is left, and why |
|---|---|---|
| Phase 0 audit | done | `docs/FRONTEND_AUDIT.md` |
| F1.1 themes | done | |
| F1.2 Helvetica | done | |
| F1.3 round shapes | done | |
| F1.4 interactive elements | done | |
| F1.5 motion | done | |
| F1.6 logos | done | The A monogram stays. The supplied wordmark is traced to `brand/agental-wordmark.svg` and used in the header, sign-in and footer (round 5 D3). |
| F2.1 first screen | done | Live since round 2. |
| F2.2 audience switch | done | Works and keeps the matching page. |
| F2.3 five steps | done | Casting has three steps, as in the existing copy. |
| F2.4 Limelight page | done | Extended by round 2 D1 to D4. |
| F2.5 pricing | done | Every amount on the site is in US dollars. |
| F2.6 no photos of people | done | |
| F2.7 less content | done | How it works, FAQ, About and casting-type pages keep their older layout. |
| F3.1 themes in the app | done | |
| F3.2 zoom and layout | done | |
| F3.3 mobile navigation | done | |
| F3.4 plan switcher | done | Paid plans answer "billing unavailable" in production until payments are approved. |
| F3.5 central dashboard | done | One "next action" block: complete profile, then first search, then applications (round 5 C2). |
| F3.6 English everywhere | done | |
| F4.1 first sign-in routing | done | The server stamps the first run in /continuer; a new account lands on the dashboard with the welcome tour on profile completeness, later sign-ins go straight to the dashboard on any device. |
| F4.2 "How this works" tutorial | done | Three-step welcome with highlights (round 4 E3), replayable from Settings; the first run is stamped on the server. |
| F4.3 student code | blocked | Waits on Stripe and the student discount amount (founders). |
| F5.1 password rules | done | Live. |
| F5.2 email verification | blocked | Built and live; sends nothing until the owner adds `RESEND_API_KEY` (agental.co domain verified in Resend). |
| F5.3 forgot password | blocked | Built and live; the email is only logged until `RESEND_API_KEY` is set. |
| F5.4 abuse protection | done | Rate limits on sign-up, sign-in and reset; Turnstile on sign-up and forgot password, switched on by `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (owner). |
| F5.5 cookie consent | done | Saved on the account and put back in a new browser (round 5 A2). |
| F6.1 Reel & Self-tape | blocked | Live; recording limits and library in place. Saving to storage from a browser waits on `SUPABASE_SERVICE_ROLE_KEY` (owner). Not tested with a real camera. |
| F6.2 Career page | done | |
| Phase 7 verification | done | Round 5 E pass: every page loads without console errors in English and French at phone size, locally; search and welcome tour exercised. Camera, Safari and Firefox not covered (see E1). |
| Phase 8 data hub and admin | done | `/admin/comptes`: accounts index with filters and CSV, per-account timeline, media through signed links, every view logged (round 5 C1). |
| Phase 9 IMDb | blocked | Out of scope this round (brief). |

## Round 2 brief

| Task | Status | What is left, and why |
|---|---|---|
| A1 home page sections | done | Live. |
| A2 audience pages | done | Live. |
| A3 reach and navigation | done | Live. |
| B1.1 sign-up, verification, first sign-in | blocked | Sign-up and first sign-in work; the verification email waits on `RESEND_API_KEY`. |
| B1.2 sign-in to dashboard | done | Live. |
| B1.3 wrong password | done | Live. |
| B1.4 forgot password | blocked | See F5.3. |
| B1.5 signed-in redirect | done | Live. |
| B2 cookie consent | done | Live, remembered on the account. |
| B3 Google and Apple | blocked | Google is built and live but the OAuth app is in Testing: the owner must add the privacy URL and publish in Google Cloud (a password re-check stopped the agent). Apple is out of scope. |
| C1 plan button | done | |
| C2 badges removed | done | Live. |
| C3 AI suggestions | done | Unchanged. |
| D1 Limelight entry points | done | Live. |
| D2 template row | done | Live. |
| D3 "Try it" without an account | done | Live. |
| D4 pricing and offers | done | Live; the student price stays "to be announced". |
| D5 Limelight backend | done | Published sites served at agental.co/s/<name>; student requests approved in admin. Real checkout waits on Stripe (out of scope). |
| E1 recording and playback | blocked | Library lists both destinations with play and delete. Real-camera, Safari, Firefox and iOS tests wait on Supabase Storage being switched on (owner key) and a signed-in production session. |
| E2 storage | blocked | Supabase Storage driver built (private buckets, TUS, signed URLs); dormant until `SUPABASE_SERVICE_ROLE_KEY`; R2 is then read-only fallback until the copy route has moved the files. |
| E3 privacy line | done | Live. |
| F account creation checks | done | Profile row, Basic plan, consent choice and first-run stamp on the server. |
| G1 finish v1 | done | This file, round 5. |
| G2 QA | done | See Phase 7 verification. |
| G3 deploy | done | Round 2, release 1 and release 2 are live; see `docs/RELEASES.md`. |

## Open questions for the founders

1. **Email sender.** Verification and password reset need the Resend API key and DNS records for agental.co.
2. **Payments.** A Limelight purchase, the 4 free Pro months and the student code need Stripe keys. Until then they can only run as a mock.
3. **Student price for the $99 Limelight offer.** No amount is set.
4. **Commission.** Removed from the plan cards, plan selector and Subscription page in release 2.
5. **Google and Apple.** Google keys are in Vercel; a redeploy turns the button on, and a privacy-policy page lets the Google app leave Testing. Apple is set aside.
6. **Videos** stay on Cloudflare R2, the private bucket already in place, by agreement with the backend session. The brief said Supabase Storage.

## Round 4 (2026-11-20)

| Group | Status | Deployment | Notes |
|---|---|---|---|
| A config and copy | done | `agental-j0ry17gkc` | Allowances 5/50/250/500, new About copy, assistant cost guard (docs/ASSISTANT.md). |
| B search usage | done | `agental-9efit794l` | Rolling 30-day period from the first search, usage line and bars. |
| C media and storage | blocked (owner key) | `agental-qptszo8sf`, `agental-3207nden0` | Session handling fixed, Supabase Storage built and dormant until `SUPABASE_SERVICE_ROLE_KEY` is set; 50 MB video cap. Root cause not confirmed on production. Not tested on Chrome, Safari or iOS Safari with a real account. |
| D email verification | done, waiting on owner | `agental-3207nden0` | Gate starts 2026-11-20T09:52:48Z once `RESEND_API_KEY` is set; banner for older accounts. Not tested with a real inbox. |
| E Google and welcome | done, waiting on owner | `agental-7ib83n3kk` | Welcome tour, Google prefill, privacy page. Google app still in Testing: add the privacy URL and publish (owner). Google round trip not tested with a real account. |


## Round 5 (2026-11-20)

| Group | Deployment | Notes |
|---|---|---|
| A media and sessions | `agental-2vqur6k92` | Precise refusals, recorder limits, library with delete, choices on the account, seed guard. |
| B email and sign-in security | `agental-ix4wun8un` | Rate limits, Turnstile (off until keys). Emails and Google wait on the owner. |
| C admin hub and dashboard | `agental-6w87jhyyf` | Accounts index, timeline, CSV; next action block; plan lists. |
| D Limelight and brand | `agental-qyd7mz7oh` | /s/<name>, student requests, wordmark. |
| E QA | see RELEASES.md | Local pass, welcome card fix on phones. |

**Waiting on the owner:** `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` (and DNS at name.com), Google privacy URL and publish, optional Turnstile keys.
**Plans to buy:** Vercel Pro (Hobby forbids commercial use; needed before charging subscriptions). Supabase: Free is enough for now (50 MB files, 1 GB storage); Pro ($25/month) when storage passes 1 GB or to stop the weekly pause.

## Round 6 (2026-11-21)

| Part | Status | Deployment | Notes |
|---|---|---|---|
| Step 0 Supabase key | done | `agental-4zl9j1leb` | `SUPABASE_SERVICE_ROLE_KEY` in Vercel Production (owner). `/api/health/storage` reports `"storage":"supabase","directUploads":true`. |
| 1.1 storage switch | done | `agental-4zl9j1leb` | Confirmed on production. Previews do not get the key (Production only), so they still read R2. |
| 1.2 copy R2 to Supabase | partial | `agental-96u1fwos4` | The admin route is ready (dry run with sizes, Free-plan fit, referenced-file counts; copies only files an account uses). The copy itself has not been run yet: it needs an admin signed in on production. |
| 1.3 remove R2 | open | | After the copy is verified, in its own change. Follow-ups for that change are listed outside the repository. |
| 1.4 media test on production | open | | Needs the owner signed in on production with their test account. |
| 1.5 choices on the account | done | `agental-96u1fwos4` | The cookie choice was the only setting kept in the browser; it now follows the account (stricter choice wins). The remaining browser storage holds drafts and a temporary take stash by design. Persistent data: production and preview deployments read the same Supabase Postgres through `DATABASE_URL`, set for both in Vercel; migrations run on production builds only and stay additive (see HANDOFF, Round 5 group A). |
| Part 2 shadcn/ui | done (partial scope) | | v0.5.4.0 live (tag `live-2026-11-21-r6-p2`, deployment `agental-82c7l3r32`): toasts, Button loading, Sheet phone menu, Select, Switch, Progress, page skeletons, icon tooltips, AlertDialog for deleting a recording. Not done: before/after screenshots, Casting pages not clicked through, native selects in `height-field.tsx`, `lead-status-select.tsx` and admin filters (see `docs/HANDOFF.md` and `TODOS.md`). |
| Parts 3 and 4 | open | | Remaining round 5 items, email codes. |
