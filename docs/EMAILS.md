# Every email Agental sends

Round 9, group 2 (2026-11-22). One row per email the website and the admin can send. All go
through `src/lib/mailer.ts` (Resend), from `EMAIL_FROM` (to be `Agental <contact@agental.co>`), and
each one is written to the email log (Admin > Emails: queued, sent, logged, failed, then delivered,
bounced, complained or delayed from the Resend webhook). Without `RESEND_API_KEY` and `EMAIL_FROM`
nothing leaves the server: the log says "logged".

Status column: **built** = code live, not yet sent for real (no Resend key);
**tested** = sent end to end on production with a Test account (result in the last column).

## Account emails (always on, rate-limited)

| Email | `kind` | Trigger | To | Template | Status | Inbox or spam |
|---|---|---|---|---|---|---|
| Confirm your email (sign-up) | `verify` | Sign-up with a password, "Resend the email" | the account | `verificationEmail` in `src/lib/email-templates.ts`, `emails.verify*` | built | not tested yet |
| Reset your password | `reset` | "Forgot password?" | the account (one account per address) | `passwordResetEmail`, `emails.reset*` | built | not tested yet |
| USC verification code | `usc_code` | Promotions > USC, "Send the code" | the @usc.edu address | `promoCodeEmail`, `emails.code*` | built | not tested yet |
| School email link (old route) | `student` | no longer reachable from the UI (round 8b) | school address | `studentEmail` | kept for links already sent | n/a |

Rate limits: sign-up, sign-in, reset and code requests are limited per address and per IP
(`src/lib/abuse.ts`); the USC code 5 per 15 minutes.

## Admin and team emails

| Email | `kind` | Trigger | To | Template | Status | Inbox or spam |
|---|---|---|---|---|---|---|
| Cleanup warning: "Confirm your email within 7 days to keep your Agental account" | `deletion_warning` | Admin > Accounts, tick rows, "Send warning email" | each ticked unverified password account | `deletionWarningEmail`, `emails.deletion*` | built (round 9 group 1) | not tested yet |
| Limelight confirmation: "We received your Limelight request" | `limelight_confirmation` | a Limelight portfolio request (public page or app) | the person who asked | `limelightConfirmationEmail`, `emails.limelight*` (round 9) | built | not tested yet |
| Limelight team alert | `limelight_alert` | same request | `LIMELIGHT_ALERT_EMAIL` (not set yet) | `leadAlertEmail` in `src/lib/limelight/outbox.ts` (reference only) | built | not tested yet |
| New message for the team | `team_alert` | a performer writes to the team in Messages | `TEAM_INBOX_EMAIL` (not set yet) | inline in `src/app/actions/messages.ts` | built | not tested yet |
| AI accounts alert | `ai_spend_alert` | balance under its threshold or 80% of a monthly budget (dashboard load, daily cron) | contact@agental.co | inline in `src/lib/ai-spend.ts` | built | not tested yet |

Retries: the Limelight alert and confirmation are retried after each request and by the daily
14:00 UTC cron (needs `CRON_SECRET`); the others are one try each, logged.

## Automatic emails (round 9, group 6)

To be added in group 6, each with its own unsubscribe link and a link to Settings >
Notifications. In test mode (`WORKFLOW_MODE` unset) they go only to Test accounts.

| Email | `kind` | Trigger | Status |
|---|---|---|---|
| Roles found (daily digest, at most one a day) | `roles_found` | new application drafts | group 6 |
| Application update | `application_update` | self-tape requested, invited, contracted, declined | group 6 |
| New reply in Messages | `message_reply` | a reply not opened within an hour | group 6 |
| Welcome | `welcome` | once the email is verified | group 6 |

## Replies to emails we receive (round 9, group 7)

Drafted by "Agental Beta V2 - Direct Replies", approved by a staff member in Admin > Replies to
approve, sent in the original thread. Listed here once group 7 lands.

## How to test one (Test account, an address the founder controls)

1. Make sure the account is marked Test (Admin > Accounts > Group: Test).
2. Trigger the email (table above).
3. Admin > Emails: the row goes queued, then sent, then delivered (needs the Resend webhook).
4. Write the result (inbox or spam) in the last column, with the date.
