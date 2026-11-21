# Account cleanup: archive or delete (proposal, round 7)

Nothing is deleted in round 7. This note is for the founders' decision.

## The problem

There are many sign-ups that are tries and spam, several created by the founders with
different emails. Round 7 adds a review status (`unreviewed`, `approved`, `test`, `staff`,
`spam`) and keeps the agents off for everything except approved accounts (test accounts in
staging). That already stops agents from running for junk. The question left is whether to
remove the junk, or remove every account and ask people to sign up again.

## Option 1: archive (recommended first step)

Mark accounts `spam` (or a later `archived` status) and leave the rows in place.

- Sign-in: refused for `spam`/`archived` with a neutral message (one check in `src/auth.ts`).
- Media: files stay in private Supabase buckets, unreachable (signed links need an allowed
  account). Storage still counts against the 1 GB Free plan.
- Searches, drafts, messages: kept, hidden from every list except the admin account page.
- Reversible: set the status back.
- Telling users: nothing to send for spam. For real people archived by mistake, the sign-in
  message points to Messages or contact@agental.co.

## Option 2: delete selected accounts

Delete the `User` row of accounts marked `spam`, after a 30-day grace period.

- The database cascades from `User` to sessions, sign-in accounts, the artist profile, media
  rows, self-tapes, threads and messages, role searches, notifications, subscriptions linked by
  relation, and student claims (37 `onDelete: Cascade` relations in `prisma/schema.prisma`).
  Audit entries keep the user id with the actor set to null, as today.
- Media files are not removed by the database: a job must delete `{userId}/...` in each bucket
  (`selftapes`, `avatars`, `media`) first, then the row. That frees storage.
- Limelight requests are not accounts and stay; they are matched by email only.
- Not reversible. Needs a backup before the run (Supabase Free has no daily backups; a manual
  `pg_dump` kept outside the repository, or Supabase Pro first).
- Telling users: none for spam. For any deleted account that had a verified email, one short
  email before deletion ("we are removing inactive beta accounts on DATE; sign in to keep
  yours").

## Option 3: delete everyone and ask people to sign up again

Same mechanics as option 2 for every non-staff account.

- Loses every real performer's profile, media and messages.
- Needs an email to every verified address at least two weeks before, with the date, what is
  removed, and how to download their media first (a download page does not exist yet).
- Only worth it if the data model changes in a way a migration cannot carry, which round 7
  does not require.

## Recommendation

Option 1 now: review the list, mark junk `spam`, approve real people. Revisit option 2 for
`spam` accounts once Supabase Pro (backups) is on. Option 3 only for a schema break.

## Decision needed

1. Archive only, or delete `spam` accounts later?
2. If delete: grace period (30 days proposed) and whether media is downloaded for anyone first.
