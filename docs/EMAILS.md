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

Layout: `src/lib/email-branded.ts` (Talent theme, Helvetica, the A monogram from `/apple-icon`, plain
English, no em dash). Engine: `src/lib/auto-emails.ts`, run every hour (GitHub Actions
`docs/ops/hourly-notify.yml, to be placed in .github/workflows` calling `/api/cron/notify`) and once a day by the Vercel cron.
Each has a one-click unsubscribe for its category (signed link, `List-Unsubscribe` header, page
`/desabonnement`) and a link to Settings > Notifications. Account emails stay on.

Two gates before anything goes out: **staff approve each category in Admin > Controls** (none is
approved by default), and in test mode (`WORKFLOW_MODE` unset) only **Test accounts** receive them.
Nothing older than a week is ever sent late.

| Email | `kind` | Trigger | Category switch for the performer | Status | Inbox or spam |
|---|---|---|---|---|---|
| Roles found (digest) | `roles_found` | new roles found (`ROLE_FOUND` notifications), at most one email a day, if the contact preference is Email or Both | Settings > Notifications > Roles found (`notifyRolesFound`) | built, tested with the mailer faked | not tested yet |
| Application update | `application_update` | self-tape requested, invited, contracted, declined (`STATUS` notifications; "declined" added in round 9) | Applications (`notifyApplications`) | built, tested with the mailer faked | not tested yet |
| New reply in Messages | `message_reply` | a reply from the agent or the team still unread after one hour; one email listing the count | Messages (`notifyMessages`) | built, tested with the mailer faked | not tested yet |
| Welcome | `welcome` | once, after the email is verified (within a week) | News and tips (`notifyProduct`) | built, tested with the mailer faked | not tested yet |

## Replies to emails we receive (round 9, group 7)

"Agental Beta V2 - Direct Replies" reads each email that reaches contact@agental.co, skips spam and
automated mail, writes a draft and posts it to the app (`/api/n8n/inbox/draft`); it sends nothing.
Admin > Replies to approve shows the original email and the draft with three buttons: Send, Edit then
send, Discard. Only that click sends.

| Email | `kind` | Trigger | To | Status | Inbox or spam |
|---|---|---|---|---|---|
| Reply to an email we received | `inbox_reply` | a staff member clicks Send in Admin > Replies to approve | the original sender, in the original thread (Re: subject, In-Reply-To, References), hidden copy to contact@agental.co | built; D3 test prepared (founder) | not tested yet |

## How to test one (Test account, an address the founder controls)

1. Make sure the account is marked Test (Admin > Accounts > Group: Test).
2. Trigger the email (table above).
3. Admin > Emails: the row goes queued, then sent, then delivered (needs the Resend webhook).
4. Write the result (inbox or spam) in the last column, with the date.
