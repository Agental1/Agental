# Limelight backend

Server side of "Limelight by Agental", in beta and by request: a performer
asks for a portfolio site, the team assembles it, the performer approves it,
and it goes online. Payments are off (`LIMELIGHT.paymentsEnabled` is false);
the checkout code below is kept for the day they are turned on. Pages and
components are outside this slice. The front-end contract, with examples, is
`docs/LIMELIGHT_HANDOFF.md`.

| File | Holds |
|---|---|
| `src/domain/limelight.ts` | Prices, `paymentsEnabled`, `includedProMonths` (4), `hostingTermMonths` (12), `LimelightOffer`, the request rules (`parseLimelightInterest`), lead statuses |
| `src/domain/site.ts` | `SITE_TEMPLATES`, `SiteContent`, `SiteInput`, `isWebUrl`, `SITE_CONTACT_FIELDS`, `slugifySubdomain`, `RESERVED_SUBDOMAINS`, `MAX_SITES_PER_USER` |
| `src/lib/billing/entitlement.ts` | `effectivePlan`, `getTalentPlan`, `extendComp`, `addMonthsUtc` |
| `src/lib/sites.ts` | Site reads, `priceForOffer`, `fulfillSiteOrder` |
| `src/lib/limelight/leads.ts` | `recordInterest`, `listLimelightLeads`, `changeLeadStatus` |
| `src/lib/limelight/outbox.ts` | `drainOutbox`, the alert email, backoff |
| `src/lib/limelight/hosts.ts`, `hostname.ts` | `resolveSiteByHost`, `normalizeHostname`, `limelightSiteHost` |
| `src/lib/limelight/domains.ts` | Custom domain rules, DNS records, `checkDomainOwnership`, `listSiteDomains` |
| `src/lib/limelight/admin.ts`, `csv.ts`, `request.ts` | Admin check, CSV output, rate limit keys, body reader, bearer check |
| `src/app/actions/sites.ts` | The site, domain and student price actions below |
| `src/app/actions/limelight.ts` | `requestPortfolioSite`, `submitLimelightLead`, `setLeadStatus` |
| `src/app/api/limelight/interest/route.ts` | `POST /api/limelight/interest` |
| `src/app/api/limelight/outbox/drain/route.ts` | `GET` or `POST /api/limelight/outbox/drain` |
| `src/app/api/admin/limelight/leads.csv/route.ts` | `GET /api/admin/limelight/leads.csv` |

## Data model

Columns are in `prisma/schema.prisma`. The four tables this work added
(`LimelightLead`, `OutboxMessage`, `SiteDomain`, `SiteRevision`) live in the
Postgres schema `limelight`; `Site`, `SiteOrder` and `StudentPriceRequest`
stay in `public` for now. Status columns are strings; the allowed values are
Zod enums in `src/domain/site.ts` and `src/domain/limelight.ts`.

- **Site**: one website. `content` and `template` are the working draft.
  `content` is JSON validated by `SiteContent` (name, headline, bio, up to 8
  https links, up to 30 credits, contact email, up to 12 media ids). `status`
  is DRAFT or PUBLISHED. `approvedRevisionId`, `approvedAt` and `approvedById`
  record the customer's approval; `publishedRevisionId` is what the public
  sees; `showContact` is the customer's switch for contact details.
  `subdomain` is unique, set at the first publication and kept afterwards.
  At most 3 sites per user. `customDomain` is an older column that nothing
  reads: domains are `SiteDomain` rows.
- **SiteRevision**: a copy of a site's template and content, numbered per
  site (`version`), written by every save. A revision stays as written.
- **SiteDomain**: a hostname that serves a site. Kind SUBDOMAIN (the hosted
  address, ACTIVE from the start) or CUSTOM (PENDING, then VERIFIED by a DNS
  record, then ACTIVE once an operator attached it at the host). FAILED
  exists in the schema; nothing sets it.
- **LimelightLead**: one "Request a portfolio site" per email address, with a
  `reference` such as `LL-7K2M9QXA`, a `submissions` counter and a status
  (NEW, CONTACTED, CLOSED).
- **OutboxMessage**: a message to deliver, written in the same transaction as
  the record it announces. PENDING, then SENT or DEAD.
- **SiteOrder**: one purchase of an offer for a site. PENDING, then PAID
  (`paidAt`, `hostingRenewsAt` = payment date plus 12 months). CANCELED and
  REFUNDED exist in the schema; nothing sets them yet. Orders outlive the
  account and the site (both ids go null): they are financial records. No
  order is created while payments are off.
- **StudentPriceRequest**: one per user. PENDING, then APPROVED or REJECTED by
  an admin (`decidedBy`, `decidedAt`), then USED once it paid for an order
  (`usedAt`). USED is final.
- **Subscription.compPlan / compUntil**: a plan granted at no charge until a
  date. See "The four Pro months".

## Lead capture

`recordInterest(raw, ctx)` in `src/lib/limelight/leads.ts` is the one place a
lead is stored. The route and both form actions call it. In order:

1. The honeypot field `company`. When filled, the answer is a success with a
   made-up reference and nothing is written, not even a rate limit event.
2. Validation (`parseLimelightInterest`). Invalid input costs no database
   work.
3. Two rate limits with `hitRateLimit`: 5 per client address per 10 minutes
   and 5 per email per hour. Both keys are HMAC hashes keyed from
   `AUTH_SECRET`; the address and the email are never written to
   `RateLimitEvent` or to a log.
4. One transaction: the `LimelightLead` row and one `OutboxMessage`
   (`kind: "limelight.lead.alert"`, `dedupeKey` from the lead id, payload
   `{ leadId, reference }`). A repeat of the same email updates the existing
   row (counter, `lastSeenAt`, empty optional fields, marketing opt-in on an
   explicit true) and writes no outbox row.

`need` (free text, 500 characters), `contactPref` and `phone` (kept only for
a call request) are validated and, for now, left out of the row.
`LEAD_DETAIL_COLUMNS` in the same file is the switch: it goes on once the
migrated database and the regenerated client both have the three columns.

`drainOutbox({ limit?, now? })` sends the alerts that are due to
`LIMELIGHT_ALERT_EMAIL` with `sendEmail`. A row is claimed with a conditional
write before it is sent, so two drains at the same moment send one alert
once. A failure adds an attempt and a wait (5 minutes, doubling, 6 hours at
most); at `maxAttempts` the row is DEAD. While `RESEND_API_KEY`, `EMAIL_FROM`
or `LIMELIGHT_ALERT_EMAIL` is missing, rows stay PENDING and no attempt is
used. The email holds the reference and the path `/admin/limelight`, and
nothing about the person. The interest route and the form actions schedule
one drain after the response; the drain route is for a scheduler, with
`Authorization: Bearer <CRON_SECRET>`.

Owner view: `listLimelightLeads({ status?, limit? })` (after
`currentAdminId()`), the action `setLeadStatus(leadId, status)` and the CSV
export. Each export and each status change writes an audit entry.

## Actions

All are in `src/app/actions/sites.ts` and return
`{ ok: true, ... } | { ok: false, error: { key } }`.

Two roles, both read from the session and the database: the **customer**
owns the site; the **operator** is an admin. Site actions answer
`errors.unauthorized` to a visitor and to an account that is neither a talent
nor an admin. A site the caller may not touch is answered exactly like a site
that does not exist (`errors.siteNotFound`). The student price admin actions
and `activateSiteDomain` answer `errors.unauthorized` when signed out and
`errors.forbidden` when the user is not an admin.

| Action | Who | On success | Other error keys |
|---|---|---|---|
| `saveSite({ siteId?, ownerId?, template, content })` | customer; operator for any site, and for a new site with `ownerId` | `{ siteId }`. Writes the draft and the next `SiteRevision` in one transaction. Media ids that are not the site owner's are dropped silently. An operator's save is audited (`limelight.site.operator_save`). | `errors.siteInvalid`, `errors.siteNotFound`, `errors.siteLimitReached`, `errors.forbidden` (a talent naming another owner), `errors.notFound` (unknown owner) |
| `approveSitePreview(siteId, expectedVersion?)` | customer only | `{ revisionId, version }`: the latest revision becomes the approved one. Audit `limelight.site.approve`. | `errors.forbidden` (operator), `errors.siteNotFound`, `errors.siteInvalid`, `errors.confirmFailed` (the latest version is not `expectedVersion`), `errors.invalidInput` |
| `publishSite(siteId)` | customer or operator | `{ subdomain }`. Publishes the approved revision and records `<subdomain>.<LIMELIGHT_ROOT_DOMAIN>` as an ACTIVE domain when that variable is set. Audit `limelight.site.publish`. | `errors.siteNotFound`, `errors.siteNotApproved`, `errors.siteInvalid`, and `errors.sitePaymentRequired` once payments are on |
| `unpublishSite(siteId)` | customer or operator | `{}`. Back to DRAFT with no published revision; subdomain, domains and approval are kept. Audit `limelight.site.unpublish`. | `errors.siteNotFound` |
| `setSiteContactVisibility(siteId, show)` | customer only | `{ showContact }`. Audit `limelight.site.contact_visibility`. | `errors.forbidden` (operator), `errors.siteNotFound`, `errors.invalidInput` |
| `addSiteDomain(siteId, hostname)` | customer or operator | `{ domainId, hostname, dns: { txtName, txtValue, cnameTarget } }`, a PENDING domain. Audit `limelight.domain.add`. | `errors.siteNotFound`, `errors.domainInvalid`, `errors.domainTaken`, `errors.forbidden` (a sixth domain) |
| `verifySiteDomain(domainId)` | customer or operator | `{ domainId, hostname, status }`, VERIFIED when the TXT record is found. Audit `limelight.domain.verify`. | `errors.notFound`, `errors.domainNotVerified` |
| `activateSiteDomain(domainId)` | operator only | `{ domainId, hostname, status: "ACTIVE" }` for a VERIFIED domain. Audit `limelight.domain.activate`. | `errors.notFound`, `errors.domainNotVerified` |
| `removeSiteDomain(domainId)` | customer or operator | `{}`. Audit `limelight.domain.remove`. | `errors.notFound`, `errors.forbidden` (the hosted subdomain) |
| `startSiteCheckout({ siteId, offer })` | customer | While payments are off: always `errors.billingUnavailable`, nothing read or written. Once on: `{ checkoutUrl? }`, or `{ alreadyPaid: true }`. Audit `limelight.checkout.start`. | `errors.invalidInput`, `errors.siteNotFound`, `errors.billingUnavailable` |
| `requestStudentPrice()` | talent | `{ status }`. Creates a PENDING request, or returns the status of the existing one unchanged. | none |
| `decideStudentPrice(requestId, decision)` | admin | `{ status }`: APPROVED or REJECTED, or USED (untouched) when the request already paid for an order. Audit `limelight.student.decide`. | `errors.invalidInput`, `errors.notFound` |
| `approveStudentPriceByEmail(email)` | admin | `{ status }`: APPROVED (the request is created if missing), or USED (untouched). Audit `limelight.student.decide` with `via: "email"`. | `errors.invalidInput`, `errors.notFound` (no account with that email) |

What the public sees is always a revision, never the working draft. Saving
changes the draft and adds a revision; it moves neither the approval nor the
published revision. `publishSite` refuses a site with no approved revision,
and writes only while the revision it read is still the approved one.

Subdomains: `slugifySubdomain` of the name on the approved revision
(lowercase ASCII, digits and hyphens, 3 to 40 characters, accents removed,
reserved names refused). A taken name gets `-2`, `-3` and so on; the unique
index settles two publications at the same moment. A name with no usable slug
gives `site-` plus the first 8 characters of the site id.

Reads for pages, in `src/lib/sites.ts`: `listMySites(userId)`,
`getSiteForOwner(userId, siteId)`, `getMyStudentPriceRequest(userId)`; and for
admin pages only, since they check nobody: `getSiteForOperator(siteId)`,
`listSitesForOperator()` and `listStudentPriceRequests()` (which returns
emails). Each site view carries `latestVersion`, `approvedVersion`,
`publishedVersion` and `showContact`.

`resolveSiteByHost(hostname)` in `src/lib/limelight/hosts.ts` answers the
published revision for an ACTIVE hostname of a PUBLISHED site, with the
contact fields removed unless `showContact` is on, and `null` for everything
else. The proxy does not call it yet: `docs/LIMELIGHT_HANDOFF.md`, section 8,
is the change to make.

## Checkout and fulfillment

Dormant while `LIMELIGHT.paymentsEnabled` is false: `startSiteCheckout`
returns before any of this runs. What follows is the behavior once it is on.

`startSiteCheckout` prices the offer with `priceForOffer`, refuses with
`errors.billingUnavailable` before writing anything when `paidPlanAllowed`
says no (production without `ALLOW_MOCK_BILLING=true`), creates a PENDING
order, then calls `billing.checkoutSiteOrder`. The mock answers
`{ paid: true }` and the action calls `fulfillSiteOrder` at once.

`fulfillSiteOrder(db, orderId, { now?, providerPaymentId? })` is the only code
that marks an order PAID. In one transaction: the order becomes PAID, an
APPROVED student request that paid for it becomes USED, the buyer gets the Pro
months, and an audit entry `limelight.order.paid` is written. It is
idempotent: calling it again for the same order changes nothing, also when two
calls run at the same moment.

The student price applies to Essential only, to a user whose request is
APPROVED, and only once `LIMELIGHT.plans.essential.studentPriceUsd` is a
number. It is `null` today, so an approved student pays $99 and the request
stays APPROVED.

## The four Pro months

Every paid order adds `LIMELIGHT.includedProMonths` (4) months of the Talent
Pro plan. `fulfillSiteOrder` sets `compPlan = "PRO"` and
`compUntil = extendComp(current compUntil, now, 4)`: calendar months in UTC
(October 31 plus 4 months is the last day of February), counted from the
current end date when it is still ahead, from now otherwise. A second site
bought during the first four months gives eight in total.

`plan`, `priceCents` and `status` are not touched, so the free months never
look like a paid subscription, and they end by themselves when the date
passes. The rule is `effectivePlan(subscription, now)`:

1. a paid plan (not FREE) with status ACTIVE wins;
2. otherwise `compPlan`, while `compUntil` is after now (`source: "limelight"`, `proUntil` set);
3. otherwise FREE.

Read a talent's plan with `getTalentPlan(userId)`, never from
`Subscription.plan`: that column says FREE during the included months. The
talent settings and plan pages still read the column and need to switch.

## Stubs until Stripe exists

- **Checkout URL.** `checkoutSiteOrder` is implemented by the mock only. A
  Stripe implementation creates a Checkout Session, stores its id in
  `SiteOrder.providerSessionId`, and returns `{ checkoutUrl, paid: false }`.
- **Webhook fulfillment.** No route receives payment events. It will verify
  the signature, record the event in `WebhookEvent`, and call
  `fulfillSiteOrder(prisma, orderId, { providerPaymentId })`. A failed or
  abandoned checkout leaves a PENDING order; nothing cancels it yet.
- **Student price used twice.** An approved student could open two checkouts
  before paying either. Harmless with the mock (the first is fulfilled at once);
  with Stripe, expire the older session when a new checkout starts.
- **Promotion codes.** None. The student price is the only discount.
- **Hosting renewal.** `hostingRenewsAt` is stored and nothing reads it: no
  renewal charge, no unpublishing at expiry.
- **Refunds and upgrades.** No action refunds an order or moves a paid site
  from Essential to Signature.
- **Emails.** One exists: the alert to the team for a new lead. The rest is
  missing: no receipt, no "your site is live", no notice to a student.
- **Published pages.** `publishSite` reserves the subdomain and records the
  hostname, and `resolveSiteByHost` answers what to serve there. The proxy
  rewrite and the page that render a site, and letting visitors see the media
  a site references, are not built.

## n8n: "Limelight request goes to the agent" (stub, nothing is sent)

Intended contract, to confirm before building. It follows
`docs/ARCHITECTURE.md`: n8n receives no name, email, text or photo.

- **When:** after `fulfillSiteOrder` commits. The purchase never waits for
  n8n and never fails because of it.
- **Call:** `POST` to a URL from a new variable (proposed:
  `LIMELIGHT_REQUESTS_WEBHOOK_URL`), JSON body, header
  `x-agental-signature: sha256=<hex HMAC-SHA256 of the raw body, keyed with N8N_SIGNING_SECRET>`.
  (The lead form used this scheme before; it stores leads in Postgres now and
  calls nothing.)
- **Body:** `{ event: "limelight.request", requestRef, offer, template, locale, mediaCount, paidAt }`.
  `requestRef` is an opaque reference that the team resolves in the admin
  area. The schema has no such column yet; do not send a user or site id.
- **Answer:** any 2xx means accepted. Otherwise the backend logs it and a
  retry is needed (not designed yet).
- **Effect in n8n:** a task for the agent (a draft, never a message sent to
  the talent). n8n does not call the backend back in this version.
