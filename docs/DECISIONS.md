# Agental decisions

The single source of truth for what the founders decided. Read this first in every session.
Change a line here only on an explicit instruction from the founders in the current
conversation, in the same commit as the code change, with the date.

Last updated: 2026-11-20 (written from the founders' decisions across rounds 1 to 6).

## Products

- **Agental Talent**: for performers.
- **Agental Casting**: for casting directors and productions.
- **Limelight by Agental**: websites for performers who have none. Part of the Talent side.

## Business model

A licensed partner agency holds the mandate and takes the commission on bookings. Agental
earns subscriptions for its tools and coaching. Representation and subscription are two
separate contracts (California Fee-Related Talent Services Law).

## Talent pricing

Source in code: `src/domain/pricing.ts` (`B2C_PLANS`). Copy never writes a figure; it uses
the `{price}`, `{commission}` and `{searches}` tokens filled by `src/lib/plan-price.ts`.

| Plan | Price | Commission on bookings, taken by our licensed partner agency | AI role searches (rolling 30 days from the first search) |
|---|---|---|---|
| Basic | $0 | 10% | 5 |
| Pro | $19/month | 10% | 50 |
| Premium | $49/month | 7.5% | 250 |
| Ultimate | $79/month | 5% | 500 |

The internal id of Basic stays `FREE`. College student discount on Pro through a verified
school email; amount not decided yet. (Restored to this grid on 2026-11-20.)

## Casting pricing (pitch deck V2)

- Free: $0, 1 project.
- Pro: $95 per seat per month, 10 projects.
- Studio: $295 per month, 5 seats.
- Enterprise: custom (SSO, API).

## Limelight

$99 or $199 one-time, plus yearly hosting. Every purchase includes 4 months of Agental Pro
for free. Student price on the $99 offer: proof of enrollment emailed to contact@agental.co,
amount not decided yet. During the beta, no payment: the team helps publish.

## Payments

Stripe is not connected yet. Paid plans answer "billing unavailable" until the founders
approve payments.

## Brand and design

- Talent theme: white to pale blue gradient (`#FFFFFF` to `#DCEAFF`), near-black text.
  Casting theme: black to deep blue (`#080B12` to `#102B63`), white text. Shared accent:
  electric blue `#246BFE`. Limelight uses the Talent theme.
- Helvetica Bold for headlines and buttons, Helvetica Regular for text. Rounded shapes. No
  beige anywhere.
- Logo: the A shaped as an opening door; the "Agental" wordmark where the full name is
  needed.
- No photos of people on public pages. No em dashes in any UI copy.
- The signed-in app uses shadcn/ui components mapped to these tokens (round 6).

## Positioning and About page

Agental was started by a group of young actors and builders, on campus, with roots in France
and at USC. No father-and-son story, no "brothers", no founder names on the public site.

## Language

English UI on English pages, French on French pages. The US market comes first; amounts in
US dollars.

## Technical stack

- GitHub `Agental1/Agental` (working branch `frontend-redesign`), Vercel project `agental`
  serving www.agental.co.
- Supabase for everything: database, auth data, files, videos and profile pictures, in
  private buckets with signed URLs. No Cloudflare R2, no AWS. Supabase Free plan for now
  (50 MB per file, 1 GB of storage); say so when something needs a paid plan.
- Emails through Resend from the agental.co domain (account of contact@agental.co).
- Google sign-in on; Apple set aside.
- n8n Cloud runs the agent workflows, connected to the site in
  round 7. Everything the agents produce is a draft; nothing is sent or submitted without the
  performer's approval.
- The in-app assistant runs in rules mode (no API key). When a key is added: Claude Haiku
  5.5, capped replies and a per-user daily limit, monthly spend limit in the Anthropic
  Console.

## Product rules

- AI role searches: a rolling 30-day period starting at the first search, counted and
  enforced on the server.
- First sign-in lands on Profile completeness with the welcome tour; later sign-ins on the
  dashboard.
- Email verification with a 6-digit code for email-and-password accounts; Google accounts
  skip it.
- Profile prefill from Google (name, email, photo with confirmation).

## Admin and agents (round 7, decided 2026-11-20)

- Admin role: contact@agental.co only. No other account is admin.
- Agents stay in test mode in production (`WORKFLOW_MODE` unset): only accounts marked Test can
  trigger an agent. Live mode waits until the founders have reviewed the admin portal and marked
  real performers Approved themselves.
- Account cleanup: archive only. Junk accounts get the Spam status; nothing is deleted.
  **Replaced 2026-11-22 (round 7b, owner) for unverified accounts:** fake accounts may be
  deleted: email never verified, created more than 7 days ago (configurable), never paid, not
  staff or test. Admin > Account cleanup lists them, can warn them by email, exports the list,
  and deletes all eligible behind a typed confirmation, with one audit entry each. Every run
  needs the owner's explicit go. See `docs/ACCOUNT_DELETION_PROPOSAL.md`.
- 2026-11-22 (round 7b, owner): agent eligibility is automatic. An account is eligible once its
  email is verified (verification email or Google) and its profile is 100% complete. Staff do
  not approve accounts; they only mark Spam, Test or Staff, or revoke eligibility. Email
  verification is read-only in the admin.
- 2026-11-22 (round 7b, owner): the first AI search starts on its own once the profile is 100%
  and the email verified, for performers who never searched. It does not stamp a click opt-in:
  the request (`auto_first`) is its own record. Automatic searches per plan, inside the monthly
  allowance (`autoSearches` in `src/domain/pricing.ts`): Basic 1; Pro, Premium and Ultimate
  `TODO(founders)` (no separate cap until decided, the six-hour searches work as before).
- 2026-11-22 (round 7b, owner): a performer answers a role from Applications (Accept, answers,
  videos recorded or picked from Reel & Self-tape, Submit). A submitted response goes to the
  Agental team's review only; nothing is sent to a casting site.
- A separate staff-only admin site at admin.agental.co (same codebase and database).

## Rules for every session

1. Keep all data, including the founders' test accounts. Never wipe or reseed. Migrations are
   additive.
2. Never type or paste a password, key or secret. Prepare the page and tell the founders
   exactly what to copy and where.
3. Deploy only when the founders ask, through `/ship` and `/land-and-deploy`. Record every
   release in `docs/RELEASES.md` with its deployment ID and the rollback ID.
4. Keep `docs/STATUS.md` and `docs/HANDOFF.md` current at the end of each session.

## History

- v1, 2026-11-18: front-end redesign (`live-2026-11-18-redesign`, `live-2026-11-18-limelight`).
- Round 2, 2026-11-19: public site structure, sign-in, Limelight, self-tape
  (`live-2026-11-19-round2`, `-release1`, `-release2`, `-google`).
- Round 3, 2026-11-19 to 2026-11-20: pricing, search button, profile links, assistant topics
  (`live-2026-11-19-r3-g1` to `live-2026-11-20-r3-g5`).
- Round 4, 2026-11-20: allowances, About page, usage tracker, media fixes, email verification,
  Google and welcome tour (`live-2026-11-20-r4-a` to `live-2026-11-20-r4-e`).
- Round 5, 2026-11-20: owner setup, media and sessions, admin data hub
  (`live-2026-11-20-r5-a` to `live-2026-11-20-r5-e`).
- Round 6, 2026-11-21: Supabase Storage, shadcn/ui, email codes (`live-2026-11-21-r6-p1` so
  far).
- Round 7, planned: n8n workflows.

## Open questions

- Student discount amounts (Pro and Limelight).
- Stripe connection date.
- Vercel plan for commercial use.
- Supabase Pro when real users upload videos.

## Differences found

Checked against the code on 2026-11-20. Not fixed; each waits for a founders' decision,
except the Talent pricing, which was restored in the same change as this file.

1. **Casting prices.** `src/domain/pricing.ts` (`B2B_PLANS`) charges Pro $99 per seat and
   Studio $299, and `messages/*/casting.json` shows $99 and $299. The deck says $95 and $295.
2. **"Per month" wording.** Plan cards say "AI role searches per month". The server counts a
   rolling 30-day period from the first search (`src/domain/role-search.ts`, `PERIOD_DAYS`).
   The comment above `AiSearchAllowance` in `src/domain/pricing.ts` still describes a
   lifetime stock and calendar months.
3. **Email verification.** Email-and-password accounts verify with a link
   (`src/lib/email-tokens.ts`), not a 6-digit code yet. The code is round 6 Part 4.
4. **Limelight figures in the copy.** Prices and hosting renewals ($99, $199, $49 and $79 a
   year) are written in `messages/*/talents.json` (Limelight sections), while
   `src/domain/limelight.ts` holds the same figures. They match today but are two sources.
5. **Apple sign-in.** Code can turn Apple on when its keys are set
   (`src/lib/auth/oauth-providers.ts`). It stays off while no Apple keys exist, which matches
   "set aside", but nothing in code forbids it.
6. **R2.** Cloudflare R2 is still wired as a read-only fallback (`WithLegacyReads`) until the
   copy to Supabase is verified and the R2-removal change lands.
