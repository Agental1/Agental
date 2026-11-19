# Limelight backend

Server side of "Limelight by Agental": a performer saves a site, pays for an
offer, publishes it. Payment is a mock until Stripe is wired. No page or
component is part of this slice.

| File | Holds |
|---|---|
| `src/domain/limelight.ts` | Prices, `includedProMonths` (4), `hostingTermMonths` (12), `LimelightOffer` |
| `src/domain/site.ts` | `SITE_TEMPLATES`, `SiteContent`, `SiteInput`, `slugifySubdomain`, `RESERVED_SUBDOMAINS`, `MAX_SITES_PER_USER` |
| `src/lib/billing/entitlement.ts` | `effectivePlan`, `getTalentPlan`, `extendComp`, `addMonthsUtc` |
| `src/lib/sites.ts` | Reads, `priceForOffer`, `fulfillSiteOrder` |
| `src/app/actions/sites.ts` | The seven server actions below |

## Data model

Columns are in `prisma/schema.prisma`. Status columns are strings; the allowed
values are Zod enums in `src/domain/site.ts`.

- **Site**: one website. `content` is JSON validated by `SiteContent` (name,
  headline, bio, up to 8 https links, up to 30 credits, contact email, up to 12
  media ids). `status` is DRAFT or PUBLISHED. `subdomain` is unique, set at the
  first publication and kept afterwards. At most 3 sites per user.
- **SiteOrder**: one purchase of an offer for a site. PENDING, then PAID
  (`paidAt`, `hostingRenewsAt` = payment date plus 12 months). CANCELED and
  REFUNDED exist in the schema; nothing sets them yet. Orders outlive the
  account and the site (both ids go null): they are financial records.
- **StudentPriceRequest**: one per user. PENDING, then APPROVED or REJECTED by
  an admin (`decidedBy`, `decidedAt`), then USED once it paid for an order
  (`usedAt`). USED is final.
- **Subscription.compPlan / compUntil**: a plan granted at no charge until a
  date. See "The four Pro months".

## Actions

All are in `src/app/actions/sites.ts` and return
`{ ok: true, ... } | { ok: false, error: { key } }`. Talent actions answer
`errors.unauthorized` to anyone who is not a signed-in TALENT. Admin actions
answer `errors.unauthorized` when signed out and `errors.forbidden` when the
user is not an admin. A site that belongs to someone else is answered exactly
like a site that does not exist.

| Action | Input | On success | Other error keys |
|---|---|---|---|
| `saveSite(input)` | `{ siteId?, template, content }` (`SiteInput`) | `{ siteId }`. Creates a DRAFT, or updates the caller's site. Media ids that are not the caller's own are dropped silently. | `errors.siteInvalid` (validation), `errors.siteNotFound`, `errors.forbidden` (already 3 sites) |
| `startSiteCheckout({ siteId, offer })` | `offer`: `"essential"` or `"signature"` | `{ checkoutUrl? }`, or `{ alreadyPaid: true }` when the site already has a paid order (nothing is created). Audit `limelight.checkout.start`. | `errors.invalidInput`, `errors.siteNotFound`, `errors.billingUnavailable` |
| `publishSite(siteId)` | site id | `{ subdomain }`. Audit `limelight.site.publish`. | `errors.siteNotFound`, `errors.sitePaymentRequired` (no PAID order), `errors.siteInvalid` (stored content unreadable) |
| `unpublishSite(siteId)` | site id | `{}`. Back to DRAFT; `subdomain` and `publishedAt` are kept. Audit `limelight.site.unpublish`. | `errors.siteNotFound` |
| `requestStudentPrice()` | none | `{ status }`. Creates a PENDING request, or returns the status of the existing one unchanged. | none |
| `decideStudentPrice(requestId, decision)` | `decision`: `"approve"` or `"reject"` | `{ status }`: APPROVED or REJECTED, or USED (untouched) when the request already paid for an order. Audit `limelight.student.decide`. | `errors.invalidInput`, `errors.notFound` |
| `approveStudentPriceByEmail(email)` | an email, any letter case | `{ status }`: APPROVED (the request is created if missing), or USED (untouched). Audit `limelight.student.decide` with `via: "email"`. | `errors.invalidInput`, `errors.notFound` (no account with that email) |

Subdomains: `slugifySubdomain(content.name)` (lowercase ASCII, digits and
hyphens, 3 to 40 characters, accents removed, reserved names refused). A taken
name gets `-2`, `-3` and so on; the unique index settles two publications at
the same moment. A name with no usable slug gives `site-` plus the first 8
characters of the site id.

Reads for pages, in `src/lib/sites.ts`: `listMySites(userId)`,
`getSiteForOwner(userId, siteId)`, `getMyStudentPriceRequest(userId)`, and
`listStudentPriceRequests()` for admin pages only (it returns emails and does
not check the caller).

## Checkout and fulfillment

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
- **Emails.** None are sent: no receipt, no "your site is live", no notice to
  a student or to the team.
- **Published pages.** `publishSite` reserves the subdomain. Serving
  `<subdomain>.agental.site`, and letting visitors see the media a site
  references, are not built.

## n8n: "Limelight request goes to the agent" (stub, nothing is sent)

Intended contract, to confirm before building. It follows
`docs/ARCHITECTURE.md`: n8n receives no name, email, text or photo.

- **When:** after `fulfillSiteOrder` commits. The purchase never waits for
  n8n and never fails because of it.
- **Call:** `POST` to a URL from a new variable (proposed:
  `LIMELIGHT_REQUESTS_WEBHOOK_URL`), JSON body, header
  `x-agental-signature: sha256=<hex HMAC-SHA256 of the raw body, keyed with N8N_SIGNING_SECRET>`,
  the same scheme as the lead form in `src/app/actions/limelight.ts`.
- **Body:** `{ event: "limelight.request", requestRef, offer, template, locale, mediaCount, paidAt }`.
  `requestRef` is an opaque reference that the team resolves in the admin
  area. The schema has no such column yet; do not send a user or site id.
- **Answer:** any 2xx means accepted. Otherwise the backend logs it and a
  retry is needed (not designed yet).
- **Effect in n8n:** a task for the agent (a draft, never a message sent to
  the talent). n8n does not call the backend back in this version.
