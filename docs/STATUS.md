# Status: v1 brief and round 2 brief

Updated 2026-11-19, branch `frontend-redesign` (pull request #7, which carries the backend branches `feat/auth-onboarding` #6, `feat/round2-server` #8 and `feat/beta-server` #9).

**Production** (agental.co) runs release 2 (`live-2026-11-19-release2`, deployment `agental-exmsrxj64-agentalco.vercel.app`). Round 2 went live on 2026-11-19, then release 1 and release 2 the same day, so the rows marked "done, local" below are now live unless their note says otherwise. Later work is tracked in `docs/HANDOFF.md`.

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
| F4.1 first sign-in routing | done, local | A new account lands on Profile with the tour; later sign-ins go to the dashboard. |
| F4.2 "How this works" tutorial | done, local | Four steps for Talent, three for Casting, opened by `?welcome=1`, replayable from Settings. Stamping the first-run flag on close is server. |
| F4.3 student code | open | Field and messages are front-end work; validation is server and waits on Stripe. |
| F5.1 password rules | done, local | Live checklist; the server enforces the same rules. Applies to sign-up; reset comes with F5.3. |
| F5.2 email verification | done, local | "Check your inbox" with a resend button (60-second rest) and the page the email links to. Emails are logged, not sent, and nobody is gated until the Resend key, DNS and a start date are set. |
| F5.3 forgot password | done, local | "Forgot password?" on sign-in, the request form (same answer whether or not an account exists) and the new-password page with the three rules. Checked locally end to end with the logged link. Sending real email waits on the Resend key and DNS. |
| F5.4 abuse protection | partial | Double submits are prevented. CAPTCHA and rate limits are server work. |
| F5.5 cookie consent | done, local | See round 2 B2. |
| F6.1 Reel & Self-tape | done, local | Renamed, old address redirects. After a take: watch it, choose "Media on my profile" or the library, save with a progress bar, or record again. In production, uploads also need a CORS rule on the storage bucket, which only the founders can add. |
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
| B1.4 forgot password | done, local | See F5.3. |
| B1.5 signed-in redirect | done, local | Home and audience pages send signed-in visitors to their dashboard. |
| B2 cookie consent | done, local | Sign-up has a cookie choice step; Settings has "Cookie preferences"; the choice is saved on the account. The site sets strictly necessary cookies only; analytics is cookieless and loads only after consent. A Google or Apple sign-up starts with strictly necessary only. |
| B3 Google and Apple | partial | Built and merged. Google: client created in Google Cloud project `agental-515217`, `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` saved in Vercel Production. The button appears after the next deploy (release 2 was built before the keys were saved). The Google app stays in Testing until a privacy-policy page exists. Apple is set aside. Using Google with the email of a password account lands on that same account. |
| C1 plan button | done | |
| C2 badges removed | done, local | "Represented" and the plan badge are gone from both dashboards. The "SIRET verified" badge on the Casting dashboard stays: it is a status, and nothing else shows it. |
| C3 AI suggestions | done | Unchanged. |
| D1 Limelight entry points | done, local | Block on the home page and the Talent page, "Websites" in the navigation, pricing overview column, "Create your website" card on the dashboard (hidden once a site exists), "Website" in the app menu. |
| D2 template row | done, local | Six templates in a row you scroll sideways, full-screen preview, "Use this template". Previews are drawn in code with initials. |
| D3 "Try it" without an account | done, local | Live preview with template, name and headline; the draft follows the visitor into the app, where "Save it to my account" stores it. |
| D4 pricing and offers | done, local | $99 and $199, the included Pro months and the student price all read from `LIMELIGHT` in `src/domain/limelight.ts`. The student price is not set, so the page says "to be announced". |
| D5 Limelight backend | partial | Server slice merged. "Your website" in the app: save the draft, choose an offer, publish, take offline; a purchase grants Pro for 4 months and Subscription shows the end date. Checked locally with mock billing. Open: real Stripe checkout (no keys), the admin screens for student price requests and student codes, serving the published site at its address. |
| E1 recording and playback | partial | Record, review, re-record, save with progress, both video formats. Not yet tested with a real camera, on phones, or in Safari and Firefox. Library playback and delete on the page still use the older list. |
| E2 storage | done, local | Server slice merged: private storage, direct uploads up to 150 MB, short-lived signed playback, delete removes the file. Production needs the bucket CORS rule. |
| E3 privacy line | done, local | Shown above the recorder. |
| F account creation checks | partial | Profile row, Free plan, plan button, consent choice and tutorial work locally. Landing on Profile completeness at first sign-in is server. |
| G1 finish v1 | partial | This file. |
| G2 QA | open | |
| G3 deploy | done | Round 2, release 1 and release 2 are live; see `docs/RELEASES.md`. |

## Open questions for the founders

1. **Email sender.** Verification and password reset need the Resend API key and DNS records for agental.co.
2. **Payments.** A Limelight purchase, the 4 free Pro months and the student code need Stripe keys. Until then they can only run as a mock.
3. **Student price for the $99 Limelight offer.** No amount is set.
4. **Commission.** Removed from the plan cards, plan selector and Subscription page in release 2.
5. **Google and Apple.** Google keys are in Vercel; a redeploy turns the button on, and a privacy-policy page lets the Google app leave Testing. Apple is set aside.
6. **Videos** stay on Cloudflare R2, the private bucket already in place, by agreement with the backend session. The brief said Supabase Storage.
