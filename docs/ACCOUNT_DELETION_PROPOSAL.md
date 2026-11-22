# Deleting fake accounts (round 7b, 3.3)

Owner decision, 2026-11-22: delete fake accounts, for example accounts with an unverified
email created before verification was required. This replaces the round 7 "archive only"
decision for unverified accounts (see `docs/DECISIONS.md`). The feature is built and deployed;
**no deletion has been run**. The first run waits for the owner's explicit go.

## What our documents say today

- **Terms of Service:** there is no Terms of Service page on the site. The footer has a
  "Terms" label (`common.footer.cgu`) but no published terms. Nothing in writing tells a user
  that an account can be removed by us.
- **Privacy Policy** (`/talents/confidentialite`, updated November 20, 2026), section "How
  long we keep it, and your choices": "We keep your data while your account is open. You can
  ... delete your account from Settings; this removes your profile, media and messages."
  It covers deletion by the user, not deletion by Agental, and says nothing about inactive or
  unverified accounts.

## What we need for this to be clean

1. **A clause in the Terms of Service** (to write, the page does not exist): "During the beta
   we may delete an account whose email address has not been confirmed within N days of
   sign-up, after an email warning when the address can receive one." Lawyer to confirm.
2. **A line in the Privacy Policy, "How long we keep it"**: "If you do not confirm your email
   address, we may delete your account and its data after [7] days; we warn you by email
   first." Bump the policy date; the cookie banner version does not need to change.
3. **A warning email before deletion** (built, optional per run): "Confirm your email within N
   days to keep your Agental account", with a confirmation link valid N days. Send it, wait N
   days, then delete what is still unconfirmed. Accounts that never received a real address
   (typos, fakes) simply bounce.
4. **Keep records for anyone who paid** (built): an account with a paid or refunded Limelight
   order, a Stripe subscription or a paid plan is never on the list. Payment and tax records
   must outlive the account; a lawyer or accountant should confirm how long (often several
   years) before we ever delete a paying account by any other route.
5. **An audit trail without the personal data** (built): one audit entry per deleted account
   with its id, a SHA-256 hash of the email, the creation date and the number of files removed.
   The address itself is not kept, so the deletion is real but provable.
6. **A backup decision**: Supabase Free has no daily backups. Deletion cannot be undone. A
   manual `pg_dump` kept outside the repository before the first run, or Supabase Pro, is
   recommended. Note a backup keeps the deleted data around: say how long it is kept.

## What the feature does (admin > Account cleanup, `/admin/suppression`)

- **List**: accounts whose email was never verified, created more than N days ago (7 by
  default; `?days=` on the page, or `ACCOUNT_DELETION_AFTER_DAYS` in Vercel), that never paid,
  and are not staff, admin or test. Google accounts are verified by Google and never listed.
- **Export**: CSV of the list (`/api/admin/suppression?days=7`), logged.
- **Warn** (optional): sends the warning email once per account and records when.
- **Delete all eligible**: requires typing `DELETE <count>` with the exact count on screen.
  Each account is checked against the rule again just before it goes. Files are removed from
  storage (media, profile picture, unfinished uploads), then the user row, which cascades to
  the profile, media rows, self-tapes, messages and searches. Limelight orders keep their row
  with the user link cleared (there are none on the list, since paid accounts are excluded).

## For a lawyer to confirm

- The Terms clause and the Privacy Policy wording above, and that a 7-day window with an
  email warning is reasonable for a free beta account.
- Whether accounts created before the clause existed can be deleted on that basis, or need
  the warning email in every case (recommended: always warn first).
- Retention periods for payment records, and for the audit log.
- U.S. state privacy laws (California CCPA/CPRA among others) and GDPR for any EU visitor:
  deletion itself is favorable, but backups and the audit hash should be described.
