# Security, rounds 8c and 8d

## Round 8d check (2026-11-22)

Read on production from the Version 46 build log (`tools/db/round8d-report.mjs`, read-only).

**User data.** 57 tables in `public` and `limelight`, all with RLS on, no policy, and no privilege
for `anon` or `authenticated`. Rounds 8d groups 1 and 2 added no table (one column on `Thread`,
one on `User`); group 3 adds `AdminTotp`, created with RLS on in the same migration (the
migration guard test enforces it). Storage: the three buckets (`avatars`, `media`, `selftapes`)
are private and `storage.objects` has no policy, so no Supabase key reaches a file. Files are
only served through the app after an access check (`/api/media/[id]`: owner, a casting team
with a candidature on that profile, or a verified admin; `/api/avatar/[userId]`; share links):
the app then answers with a signed URL. Since round 8d a media link lasts 10 minutes (the
backend default was an hour), an avatar link 5 minutes, a share-link file 15 minutes.

**Prices, promotions and quotas.** Read on the server only, from `src/domain/pricing.ts`.
`recordPlanChoice` takes a plan id and a promotion id, nothing else: the price comes from
`B2C_PLANS`, the promotional price only for a USC-verified account, and choosing a plan changes
neither the plan nor the allowance (Stripe is not connected). `startFindingRoles` takes a
client key only; the plan, quota and slots are read from the database inside the transaction.
`tests/api/price-tamper-r8d.test.ts` sends modified requests (a price, a fake promotion, a plan
object, extra fields) and proves nothing changes.

**Admin.** Every admin page, server action and API checks the admin role on the server
(`currentAdminId`, `isTeamMember` or `isVerifiedAdmin`, reading `isAdmin` and the allowlist from
the database on each call). Round 8d added the check to the two pages that relied on the
layout's check alone (Minors, Style guide). Admin actions are in the audit log (account status,
deletion, messages, announcements, Limelight leads, student codes, exports, two-factor).

**Two-factor for the admin role.** The app signs people in with Auth.js, not Supabase Auth, so
Supabase's own TOTP does not apply to these accounts. The same standard (TOTP, RFC 6238,
6-digit codes from an authenticator app) is built into the app: `src/domain/totp.ts`,
`src/lib/admin-mfa.ts`, page `/securite-admin`. The secret is stored encrypted (AES-256-GCM,
key derived from `AUTH_SECRET`) in `AdminTotp`; a code works once; 5 codes per 15 minutes; every
success and failure is in the audit log. A good code sets an HttpOnly signed cookie valid 12
hours; without it, an admin is treated as a non-admin everywhere (pages, actions, APIs, media,
inbox). Required in production. `ADMIN_MFA_REQUIRED=false` in Vercel turns it off (a lost phone);
the founder then signs in, the page offers a new enrollment only after the old `AdminTotp` row
is removed (Supabase SQL editor: `delete from "AdminTotp" where "userId" = '<id>';`).

**Rate limits.** Sign-up (5 an hour per address, 3 per email), sign-in (30 per 15 minutes per
address, 10 per email) in the form action and, since round 8d, inside the credentials check
too, so a POST straight to `/api/auth/callback/credentials` is limited; password reset (per
address and per email); email verification resend (1 a minute, per hour); USC code (1 a minute,
5 a day, 5 attempts per code); student code; messages to the team; search launches (20 an hour,
on top of the plan quota); admin codes (5 per 15 minutes).

# Security pass, round 8c (2026-11-22)

How the database is protected is described in `docs/DATA_SECURITY.md`. This file records the
round 8c audit of what rounds 8 and 8b added, and the changes made in round 8c.

## How access works

The app reaches Postgres through Prisma as the table owner, so row level security (RLS) does not
apply to it: every "owner only" and "admin only" rule lives in server code (sessions checked on
each route and server action). RLS is there to close the other door: Supabase's Data API, used
with the public `anon` key or an `authenticated` token. Every app table has RLS on, no policy and
no privilege for `anon` or `authenticated` (`20261118000000_enable_rls`,
`20261119000000_lock_public_grants`), and `tools/db/migration-guards.ts` fails the tests if a
migration grants anything to those roles or creates a table without RLS.

## Audit of the round 8 and 8b tables and columns

Checked on production on 2026-11-22 from the build log of Version 41 (read-only report): **57
tables in `public` and `limelight`, all with RLS on, no policy, and no privilege for `anon` or
`authenticated`.** In particular:

| Added in | Table or columns | Holds | Who reads it (server code) | Data API |
|---|---|---|---|---|
| Round 8 | `Notification` (title, body, link) | a person's bell items | the owner (`/api/notifications`, session user id) | closed |
| Round 8 | `Announcement`, `AnnouncementRead` | staff updates, who read them | everyone signed in reads; admins write | closed |
| Round 8 | `GeoCountry`, `GeoAdmin1`, `GeoCity` | public place names | the location picker | closed |
| Round 8 | `ArtistProfile` location and phone columns | country, state, city id, E.164 phone | the owner; staff in the admin | closed |
| Round 8 | `ArtistProfile` SMS consent columns | channel, consent date and version | the owner; staff | closed |
| Round 8b | `ArtistProfile` agent setup columns | agent name, what it helps with | the owner | closed |
| Round 8b | `role_search_requests.scheduledFor` | search start time | the owner; staff | closed |
| Round 8b | `PromoVerificationCode` | USC codes, stored as a keyed hash only | the server only | closed |
| Round 8b | `PlanChoice` | plan, price, promotion chosen | the owner writes; staff read | closed |
| Round 8b | `User.uscVerifiedAt`, `uscVerifiedEmail` | USC verification | the owner; staff | closed |
| Round 7b | `EmailLog` | email recipient, subject, status | admins only (Emails page) | closed |

Nothing was public. No change was needed to the tables.

## Changed in round 8c

- **Live bell (Supabase Realtime).** No table was opened. A trigger on `Notification` sends an
  empty "notification" signal on the private Realtime topic `notifications:<userId>`; the policy
  `agental_bell_own_topic` on Supabase's own `realtime.messages` lets a token read its own topic
  only. The token is signed by the app for the signed-in person (`/api/realtime/token`, one
  hour, role `authenticated`, `sub` = user id) with `SUPABASE_JWT_SECRET`. The bell then reloads
  through `/api/notifications`, which checks the session: no notification content travels over
  Realtime. Off until the founders add `SUPABASE_JWT_SECRET` and the publishable key; the
  60-second refresh stays as the fallback. To know: that token is a real `authenticated` token
  for every Supabase API, not only Realtime. It reaches nothing today because no app table or
  Storage bucket grants anything to `authenticated`; the migration guard keeps it that way for
  app tables, and any future Storage policy for `authenticated` must take it into account. It
  lasts an hour, also after sign-out.
- **Rate limits.** Every route that sends an email or a code already had a database-backed limit:
  sign-up verification resend, password reset (per IP and per address), USC code (one a minute,
  5 a day per account and per address), student email, messages to the team. Round 8c adds one on
  search launches: 20 presses of "Start finding roles" an hour per person, on top of the plan
  quota.
- **Backups.** Daily, free, in a private Storage bucket: `docs/BACKUPS.md`.
- **Build report.** A one-off read-only report in the production build (`tools/db/round8c-report.mjs`)
  printed the audit above; emails are masked and it never holds up a build. To remove after
  round 8c.

## Supabase Free plan usage (2026-11-22)

| | Used | Free plan limit | Note |
|---|---|---|---|
| Database | 30.5 MB (16 MB is GeoNames) | 500 MB | about 6% |
| Storage | 3.1 MB, 9 files (3 self-tapes, 2 avatars, 4 media) | 1 GB | under 1% |
| Egress | not readable from the database; Supabase > Usage | 5 GB / month | check monthly in the dashboard |
| File size | | 50 MB per file | the recorder stops before 50 MB |

When to move to Pro ($25/month: 8 GB database, 100 GB storage, 250 GB egress, daily backups):
when real performers upload videos. A two-minute 720p self-tape is about 35 to 40 MB, so the
1 GB of storage holds roughly 25 self-tapes. Watch Storage first; the database will last much
longer. A Free project is also paused after a week without activity, which daily traffic and
the backup cron prevent.
