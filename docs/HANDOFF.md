# Handoff for the next model or person

Updated 2026-11-19. Read this first, then `docs/STATUS.md` (every task of the first two briefs) and `docs/FRONTEND_BACKEND_HANDOFF.md` (contracts between the two working sessions).

## Where things stand

| | |
|---|---|
| Repository | `Agental1/Agental` (public: no secrets, no `docs/PLAN.md`) |
| Working branch | `frontend-redesign`, pull request #7, stacked on #2. It contains the backend branches `feat/auth-onboarding` (#6) and `feat/round2-server` (#8). |
| Live site | agental.co runs tag `live-2026-11-19-round2` (`b506458`), deployment `agental-rmh721urr-agentalco.vercel.app` |
| Going back | `docs/RELEASES.md`: one tag and one deployment per live version; `vercel promote <deployment>` puts an older one back |
| Deploying | `vercel deploy --prod` from this Mac (the GitHub link to Vercel is not approved). The build applies pending Prisma migrations to production. After a deploy: tag, push the tag, add a row to `docs/RELEASES.md`. |
| Local run | Node and bun in `~/Downloads/agental-workflows/.tools`. Database: `./node_modules/.bin/prisma dev start agental-local`. Dev server: launch config `agental-site-db` (port 3200). Seed logins are in the README, local only. If a nested page answers 404 in dev, restart the server. |
| Checks | `bun run typecheck`, `bun run lint`, `bun run i18n:check`, `bun run test` (with the local `DATABASE_URL` for the database test), `bun run build` |
| Two sessions | A front-end session (this branch) and a backend session (its own worktree `Agental-backend`). Shared notes: `~/Downloads/agental-workflows/shared-notes/`. |

Briefs, on the owner's Desktop: `Agental_Cowork_Frontend_Prompt.md` (v1), `Agental_Cowork_Round2_Prompt.md` (round 2), `Agental_Claude_Cowork_Prompt.md` (beta brief, six tasks, in progress).

Rules from the owner: design is approved, keep it; every amount in US dollars; American English, no em dashes; keep a rollback point for every live version; Apple sign-in is set aside for now.

## Beta brief: state by task

| Task | State | Evidence or next action |
|---|---|---|
| 1. Finish in-progress work | partial | Open items: see "Open items" below. |
| 1. Beta notices | done, local | Footer under the legal links (every public page), About page, Limelight hero. Flags in `src/data/beta.ts`, copy in `common.beta`. Not deployed yet. |
| 2. Google sign-in | blocked on one owner action | Cause found: production has no `AUTH_GOOGLE_ID` or `AUTH_GOOGLE_SECRET`, so the button is hidden by design (`/api/auth/providers` lists credentials only). The code path is built and tested locally with fixtures. Next: create the OAuth client in Google Cloud (project of contact@agental.co), add the two variables in Vercel Production, redeploy, run a real round trip. Google asked for the account password, which only the owner can type. |
| 3. Media and connected accounts | partial | Settings > Connected accounts is built in both apps. Reel & Self-tape records, reviews and uploads to private storage with a destination choice. To do: Profile > Media sections (Headshots, Reel/Voice, Self-tapes), share and revoke, attach to a draft, delete across storage, the two-identity access test. |
| 4. Workflows | not started here | Backend session. n8n exports are in `~/Downloads/agental-workflows/` and `n8n/`. Nothing live is connected. |
| 5. One-performer calibration | not started | Backend session, with a synthetic performer. |
| 6. Limelight | partial | Page, templates, Try it, Your website (save, mock purchase, publish) exist. To do: review of #2 at four widths, `POST /api/limelight/interest` with persistence and outbox, the "Request a portfolio site" form, serving a published site by hostname, Axel's handoff. |

## Open items from the earlier briefs

- Verification and forgot-password emails: screens and server are built and checked locally (`/mot-de-passe-oublie`, `/reinitialiser`, `/verifier`). Not deployed. No email sender is configured, so emails are logged, not sent.
- Admin screens: student price requests, student codes, accounts index and timeline.
- Published Limelight sites are not served at `*.agental.site`.
- Recording was never tested with a real camera, on phones, or in Safari and Firefox.
- A sign-up and sign-in on production has not been done by either session.
- How it works, FAQ, About and casting-type pages keep their older layout.
- Existing copy still has em dashes and French-law wording ("governed by French law", "registered with the French authorities") that does not fit a U.S. beta. This is a copy and counsel decision.

## Owner-only actions

| Action | Where | Unblocks |
|---|---|---|
| Sign in to Google Cloud as contact@agental.co when asked | Chrome | Creating the Google sign-in client |
| Paste the Google client secret | Vercel > agental > Settings > Environment Variables > Production, name `AUTH_GOOGLE_SECRET` | Google sign-in on the live site |
| Add the CORS rule from `docs/MEDIA_HOSTING.md` | Cloudflare > R2 > bucket `agental-media` > Settings | Video uploads on the live site |
| Resend API key and DNS records for agental.co | Resend, then Vercel variables | Verification and password-reset emails |
| Stripe keys, after counsel signs off | Vercel variables | Real payments |
| Student price for the $99 Limelight offer | Tell either session | The student line on the Limelight page |
| Commission wording on pricing | Decision | Pricing copy |

## Release boundary for the U.S. beta

Kept off or behind the mock: online payments, paid access to roles, automated submissions, live producer ranking. Active: self-managed profiles, private media, application drafts for human review. Adults only (date of birth required at sign-up, under-18s refused on the server).

## Next concrete task

Finish Google sign-in: once the owner has signed in to Google Cloud in Chrome, create the OAuth client (type Web application; origin `https://www.agental.co`; redirect `https://www.agental.co/api/auth/callback/google`; add `http://localhost:3200/api/auth/callback/google` for local tests), set `AUTH_GOOGLE_ID` in Vercel, have the owner paste `AUTH_GOOGLE_SECRET`, redeploy, tag, and run the round trip: first login, return login, sign-out, cancel, protected route while signed out, mobile width. Then Task 3's Profile > Media.

## Contracts agreed for the beta brief (backend branch `feat/beta-server`)

Not merged yet; the UI builds against these names. Full text in the shared notes.

- **Tapes**: `uploadMedia(file, { type: "SELFTAPE", tapeId?, title?, demoBrief? })`; `listTapes(profileId)` in `src/lib/tapes.ts`; `renameTape`, `deleteTape` in `src/app/actions/tapes.ts`.
- **Sharing**: `createShareLink(mediaId, { expiresInHours? })` (shown once; 72 hours by default, 7 days at most, 5 active per clip), `revokeShareLink(shareId)`, `listShareLinks(mediaId)`; public file at `GET /api/share/<token>`; the viewing page `/[locale]/partage/[token]` is front-end work.
- **Drafts**: `listMyDrafts`, `getMyDraft`; `attachMediaToDraft`, `detachMediaFromDraft`, `reviewDraft(draftId, "approve" | "decline" | "needs_info", reason?)`. Approving records a decision; nothing is submitted.
- **Connected accounts**: `listConnectedAccounts(userId)`, `disconnectProvider(provider)` (refused with `errors.lastLoginMethod` when it would leave no way to sign in).
- **Limelight leads**: `POST /api/limelight/interest` and the form action `requestPortfolioSite(prevState, formData)`; `listLimelightLeads()` and `GET /api/admin/limelight/leads.csv` for admins.
- **Published sites**: `resolveSiteByHost(hostname)`; `approveSitePreview`, `publishSite`, `unpublishSite`, `addSiteDomain`, `verifySiteDomain`.

Backend boundaries: `feat/beta-server` adds a migration, so it goes to production only on the owner's word; n8n exports stay out of the public repository; payments stay off.
