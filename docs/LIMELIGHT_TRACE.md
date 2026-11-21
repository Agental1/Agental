# Limelight requests: trace and alert path (round 7, Part B)

Traced on branch `round7` from the code, then checked with one sample submission on the local
database (section "Sample submission").

## Two entry points, one path

| Entry point | Where | UI component | Server action |
|---|---|---|---|
| Public form | `/en/talents/limelight`, "Start your site" | `LimelightContactForm` (`src/components/talents/limelight-contact-form.tsx`) | `submitLimelightLead` (`src/app/actions/limelight.ts`) |
| In-app request | Talent app, Your website, "Request" on a site card (`src/components/talents/site-panel.tsx`) | the same `LimelightContactForm`, prefilled with the performer's name, email and site | the same `submitLimelightLead` |
| API (no UI today) | `POST /api/limelight/interest` | none | `recordInterest` directly |

All three end in `recordInterest` (`src/lib/limelight/leads.ts`):

1. Honeypot field `company` filled: answers success, stores nothing.
2. Validation, then rate limits kept in the database: 5 per client address per 10 minutes, 5
   per email per hour.
3. One transaction: if the email is new, create `limelight.LimelightLead` (status `NEW`, a new
   reference) and one `limelight.OutboxMessage` (kind `limelight.lead.alert`, status `PENDING`,
   unique `dedupeKey` per lead). If the email already exists, the lead's `submissions` count
   goes up and no second alert is created.
4. Only after the commit does the form show success. Then `scheduleOutboxDrain()` tries to send
   due alerts after the response.

So: one lead per email, one reference, one alert, created only once the row is stored.

## Where you see it

- **Admin, Limelight requests** (`/en/admin/limelight`): reference, date, name, email, type of
  work, what they need, contact preference, follow-up status (New, Contacted, Closed, changed
  from the row and audited), and since round 7 a **Team alert** column: Pending, Sent, Failed
  or None. CSV export at the top.
- The alert email itself carries only the reference and the admin path
  (`/admin/limelight?ref=<reference>`), never the person's details.

## Where the alert goes, and its state

`drainOutbox` (`src/lib/limelight/outbox.ts`) sends to `LIMELIGHT_ALERT_EMAIL` through Resend
(`src/lib/mailer.ts`). It needs three Vercel variables: `RESEND_API_KEY`, `EMAIL_FROM`,
`LIMELIGHT_ALERT_EMAIL`. A scheduler can also call `/api/limelight/outbox/drain` with
`Authorization: Bearer <CRON_SECRET>`.

State per alert, shown in the Team alert column:

| State | Meaning |
|---|---|
| Pending | stored, not sent yet (sender not configured, or waiting for a retry) |
| Sent | Resend accepted it |
| Failed | five attempts failed; the row stays for staff to see |

**Today in production:** `RESEND_API_KEY`, `LIMELIGHT_ALERT_EMAIL` and `CRON_SECRET` are not
set in Vercel (checked with `vercel env ls`; `EMAIL_FROM` is set). Every alert therefore stays
**Pending** and nobody is emailed. The lead itself is stored and visible in the admin.

To turn alerts on (owner): Resend domain verified, then Vercel, agental, Settings, Environment
Variables, Production: `RESEND_API_KEY` (from Resend), `LIMELIGHT_ALERT_EMAIL` (the team
address that should receive alerts), then redeploy. Optional: `CRON_SECRET` plus a scheduler
for retries.

## A later alert when the site is finished

None exists. `publishSite` (`src/app/actions/sites.ts`) publishes after the performer approves
the preview and records an audit entry, but sends no email and writes no outbox row. If wanted,
it is a separate event: an outbox kind `limelight.site.published` written in the same
transaction as the publish, drained by the same path, with its own admin column.

## Gaps found

1. Both UI entry points save `source: "limelight-page"`, so staff cannot tell an in-app request
   from the public form. Fix: a `source` value from an allowlist (`limelight-page`,
   `app-site-panel`).
2. The comment in `limelight-contact-form.tsx` (TODO: `requestPortfolioSite` replaces
   `submitLimelightLead`) is stale: `submitLimelightLead` already stores through
   `recordInterest` with an alert.

## Separate workflow?

Not needed. The existing path stores the request durably and queues exactly one alert; what is
missing is configuration (the three variables above), not a workflow. Limelight stays out of
n8n, independent from casting research and inbound email.
