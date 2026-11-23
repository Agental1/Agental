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
