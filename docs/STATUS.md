# Status: v1 brief and round 2 brief

Updated 2026-11-19, branch `frontend-redesign` (pull request #7, which now carries the backend branch `feat/auth-onboarding`, pull request #6).

**Production** (agental.co) runs the v1 state through Phase 3. Everything marked "done, local" below is committed and checked against a local database, and is waiting for the round 2 deploy (G3).

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
| F1.6 logos | partial | The A monogram is everywhere. The wordmark exists only as a picture (`brand/source`), so the site sets "Agental" in Helvetica Bold. The third file (lockup) was never supplied. |
| F2.1 first screen | done, local | Replaced by round 2 A2: tiles open the audience pages. |
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
| F3.5 central dashboard | partial | The "Complete your profile" card and AI suggestions are in place. A single "next action" block is not built. |
| F3.6 English everywhere | done | |
| F4.1 first sign-in routing | partial | After sign-up, the wizard leads to the dashboard with a "Complete your profile" card. Landing on Profile completeness needs a stored flag (server). |
| F4.2 "How this works" tutorial | done, local | Four steps for Talent, three for Casting, opened by `?welcome=1`, replayable from Settings. Stamping the first-run flag on close is server. |
| F4.3 student code | open | Field and messages are front-end work; validation is server and waits on Stripe. |
| F5.1 password rules | done, local | Live checklist; the server enforces the same rules. Applies to sign-up; reset comes with F5.3. |
| F5.2 email verification | blocked | No email sender yet: Resend API key and DNS records for agental.co are missing. |
| F5.3 forgot password | blocked | Same blocker as F5.2. |
| F5.4 abuse protection | partial | Double submits are prevented. CAPTCHA and rate limits are server work. |
| F5.5 cookie consent | done, local | See round 2 B2. |
| F6.1 Reel & Self-tape | partial | Renamed, with the old address redirecting. Choosing where a recording is saved, and upload progress, wait for the upload contract (server). |
| F6.2 Career page | done | |
| Phase 7 verification | partial | Done for Phases 1 to 3. To run again at the end of round 2. |
| Phase 8 data hub and admin | open | `AuditLog`, `/admin` and `/admin/audit` exist. The accounts index and timeline are not built. |
| Phase 9 IMDb | open | Optional. |

## Round 2 brief

| Task | Status | What is left, and why |
|---|---|---|
| A1 home page sections | done, local | What is Agental, How Agental works, Limelight, pricing overview, the two choices again. |
| A2 audience pages | done, local | Account card on top (540px wide, about 70% of a 800px-high screen, 52px fields), "See more", then the details. Routes stay `/talents` and `/casting`. Talent pricing shows Free and Pro, with a link to all plans. |
| A3 reach and navigation | done, local | Tiles, header switch and footer link to both pages; sticky in-page menu. |
| B1.1 sign-up, verification, first sign-in | partial | Sign-up and onboarding work. Verification email blocked (F5.2). |
| B1.2 sign-in to dashboard | done, local | |
| B1.3 wrong password | done, local | "Wrong email or password.", the email stays in the field. |
| B1.4 forgot password | blocked | F5.3. |
| B1.5 signed-in redirect | done, local | Home and audience pages send signed-in visitors to their dashboard. |
| B2 cookie consent | done, local | Sign-up has a cookie choice step (Accept all, Reject non-essential, Manage preferences); Settings has "Cookie preferences". Audit: the site sets strictly necessary cookies only (session, security, language, the consent choice); analytics is cookieless, and now loads only after consent. Copying the choice onto the account is server. A Google or Apple sign-up skips the step and starts with strictly necessary only. |
| B3 Google and Apple | partial | Built on the app's own sign-in system (Auth.js), in pull request #6. The buttons appear only when the provider keys exist. `docs/OAUTH_SETUP.md` is not written yet: the brief's steps describe Supabase Auth, which the app does not use, so the callback URLs differ. |
| C1 plan button | done | |
| C2 badges removed | done, local | "Represented" and the plan badge are gone from both dashboards. The "SIRET verified" badge on the Casting dashboard stays: it is a status, and nothing else shows it. |
| C3 AI suggestions | done | Unchanged. |
| D1 Limelight entry points | done, local | Block on the home page and the Talent page, "Websites" in the navigation, pricing overview column, "Create your website" card on the dashboard, "Website" in the app menu. The card shows for every performer until sites exist on the server. |
| D2 template row | done, local | Six templates in a row you scroll sideways, full-screen preview, "Use this template". Previews are drawn in code with initials. |
| D3 "Try it" without an account | partial | Live preview with template, name and headline. "Save my site" keeps the draft on the device and leads to account creation. Storing it on the account is server (`saveSite`). |
| D4 pricing and offers | done, local | $99 and $199 from configuration, the college student line on the $99 offer, "4 months of Agental Pro" on both. The student price reads "to be announced" until the founders set it. |
| D5 Limelight backend | open | Server. Payments are a mock today; no Stripe account is wired. |
| E1 recording and playback | partial | The recorder now keeps the browser's real format (MP4 on Safari, WebM on Chrome and Firefox) and shows a message when the camera is refused. Not tested on real phones. Saving large videos waits for the upload contract. |
| E2 storage | open | Server. The app stores media in a private Cloudflare R2 bucket, not Supabase Storage. Videos over about 1 MB fail in production today. |
| E3 privacy line | done, local | Shown above the recorder. |
| F account creation checks | partial | Profile row, Free plan, plan button, consent choice and tutorial work locally. Landing on Profile completeness at first sign-in is server. |
| G1 finish v1 | partial | This file. |
| G2 QA | open | |
| G3 deploy | open | Waits for G2. |

## Open questions for the founders

1. **Email sender.** Verification and password reset need the Resend API key and DNS records for agental.co.
2. **Payments.** A Limelight purchase, the 4 free Pro months and the student code need Stripe keys. Until then they can only run as a mock.
3. **Student price for the $99 Limelight offer.** No amount is set.
4. **Commission.** The brief says Agental takes none; the plan cards, Talent settings and the payback table show 10%, 7.5% and 5%.
5. **Google and Apple.** Someone with access must create the Google client and the Apple Services ID and add the keys in Vercel.
6. **Videos** stay on Cloudflare R2, the private bucket already in place, by agreement with the backend session. The brief said Supabase Storage.
