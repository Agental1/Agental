# Limelight handoff: what the server gives the front end

For Axel. Limelight is in beta and "by request": a performer asks for a
portfolio site, the team builds it, the performer approves it, and it goes
online. Payments are off. This page lists what exists on the server, how to
call it, and what is still unfinished. It holds variable names only, never a
value.

Suggested copy for the page:

> Limelight is in beta. Portfolio setup is currently available by request.

Call to action: **Request a portfolio site**

## 1. What exists and where

| Piece | File |
|---|---|
| Request rules (fields, lengths, error keys), `LIMELIGHT.paymentsEnabled` | `src/domain/limelight.ts` |
| Lead storage, dedupe, rate limits, owner list | `src/lib/limelight/leads.ts` |
| Alert to the team (outbox, retries) | `src/lib/limelight/outbox.ts` |
| `POST /api/limelight/interest` | `src/app/api/limelight/interest/route.ts` |
| `GET` or `POST /api/limelight/outbox/drain` (scheduler only) | `src/app/api/limelight/outbox/drain/route.ts` |
| `GET /api/admin/limelight/leads.csv` (admins only) | `src/app/api/admin/limelight/leads.csv/route.ts` |
| Form actions `requestPortfolioSite`, `submitLimelightLead`, and `setLeadStatus` | `src/app/actions/limelight.ts` |
| Site content schema, templates, subdomain rules | `src/domain/site.ts` |
| Site actions (save, approve, publish, domains) | `src/app/actions/sites.ts` |
| Site reads for pages | `src/lib/sites.ts` |
| Hostname to published site | `src/lib/limelight/hosts.ts` |
| Hostname rules the proxy can import | `src/lib/limelight/hostname.ts` |
| Custom domain rules and DNS check | `src/lib/limelight/domains.ts` |
| Admin check for pages and routes | `src/lib/limelight/admin.ts` |

A lead is stored in Postgres before the person sees a success. The alert to
the team is written in the same transaction and sent afterwards, with
retries. n8n is out of this path: nothing is forwarded to it, and nothing is
"logged instead of stored".

## 2. The request route

`POST /api/limelight/interest`, body `application/json`, 8 KB at most.

| Field | Rule |
|---|---|
| `name` | required, 1 to 120 characters |
| `email` | required, trimmed and lowercased on the server |
| `performerType` | optional: `actor`, `musician`, `dancer`, `voice`, `model`, `comedian`, `creator`, `other` |
| `portfolioUrl` | optional, an `http://` or `https://` address, 300 characters at most |
| `need` | optional, what they need in their own words, 500 characters at most. Stored on one line (line breaks become spaces). The page's fixed choices (`new`, `redo`, `unsure`) are valid text too. |
| `contactPref` | optional: `email` or `call`, `email` when absent |
| `phone` | required when `contactPref` is `call` (7 to 15 digits; spaces, dots, hyphens, parentheses and a leading `+` are fine). With any other preference it is ignored and never stored. |
| `marketingOptIn` | optional boolean, `false` when absent. Stored apart from the consent below. |
| `consentVersion` | required, 40 characters at most. Send it only once the person agreed. |
| `source` | required, 60 characters at most, for example `limelight-page` |
| `locale` | optional: `en`, `fr`, `es`, `zh`. Anything else is stored as `en`. |
| `company` | the honeypot. Leave it empty. |

Unknown fields are ignored.

### The four answers

**201, stored.**

```json
{ "ok": true, "reference": "LL-7K2M9QXA" }
```

**400, something is wrong with the request.** One key per field:

```json
{ "ok": false, "fieldErrors": { "email": "errors.emailInvalid", "phone": "errors.limelightContactRequired" } }
```

When the body itself is unusable (wrong content type, broken JSON, over
8 KB) there is no field to point at:

```json
{ "ok": false, "error": "errors.invalidInput", "fieldErrors": {} }
```

**429, too many requests.** The header `Retry-After` gives the wait in
seconds.

```json
{ "ok": false, "error": "errors.limelightTooMany" }
```

**500, the request was not stored.** The same request can be sent again.

```json
{ "ok": false, "error": "errors.limelightSendFailed" }
```

### curl

```bash
curl -i -X POST https://<host>/api/limelight/interest \
  -H 'content-type: application/json' \
  -d '{"name":"Ana Lee","email":"ana@example.com","performerType":"actor","need":"new","contactPref":"call","phone":"+1 310 555 0142","consentVersion":"request-2026-11","source":"limelight-page","locale":"en"}'
```

### fetch

```ts
const res = await fetch("/api/limelight/interest", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name,
    email,
    performerType,          // optional
    portfolioUrl,           // optional
    need,                   // optional
    contactPref,            // "email" | "call"
    phone,                  // only when contactPref === "call"
    marketingOptIn,         // boolean
    consentVersion,         // only when the consent box is ticked
    source: "limelight-page",
    locale,
    company: honeypotValue, // stays ""
  }),
});
const data = await res.json();
if (res.status === 201) showSuccess(data.reference);
else if (res.status === 400) showFieldErrors(data.fieldErrors, data.error);
else showError(data.error); // 429 and 500
```

### Error keys and what to show

Every key is in `messages/<locale>/app.json` under `errors`. Render them with
`t(key)`, or with the existing `ActionErrorMessage` component.

| Key | Where it comes from | What the page shows |
|---|---|---|
| `errors.nameRequired` | `fieldErrors.name` | The message under the name field. |
| `errors.emailInvalid` | `fieldErrors.email` | The message under the email field. |
| `errors.urlInvalid` | `fieldErrors.portfolioUrl` | The message under the link field. |
| `errors.consentRequired` | `fieldErrors.consentVersion` | The message next to the consent box. |
| `errors.limelightContactRequired` | `fieldErrors.phone` | The message under the phone field. The English text of this key talks about the name today; a phone wording is requested. |
| `errors.invalidInput` | any other field, or the whole body | Under the field when there is one, otherwise above the button. |
| `errors.limelightTooMany` | 429 | Above the button. Keep the form filled; the person tries again in a few minutes. |
| `errors.limelightSendFailed` | 500 | Above the button, with the form still filled, so one more click sends it again. |

### What the form must do

- Disable the submit button while the request is pending.
- Keep everything the person typed after any failure.
- Show the success state only on 201. A network error is a failure.
- On success, show the reference and the next step, for example: "We have
  your request (LL-7K2M9QXA). We will write to you within two working days."
  The reference names the request; it opens nothing.
- Link the consent text next to the box, and send the version of that text as
  `consentVersion`. Change the version string whenever the text changes.
  `LIMELIGHT_DEFAULT_CONSENT_VERSION` in `src/domain/limelight.ts` is the
  version of the privacy line of today's form.
- Keep `marketingOptIn` as its own unticked box. It is never implied by the
  consent to be contacted about the request.
- Show the phone field only when the person picks "call me".
- Keep the honeypot field `company` hidden from people and from screen
  readers, as the form does today.

### Sending the same email twice

One lead per email address. A repeat answers 201 with the SAME reference and
sends the team no second alert. Fields that were empty get filled; the name
and the first consent version stay. The marketing box is only ever turned on.

### Cross-site posts

The route reads no cookie. It accepts `application/json` only, which a form
on another site cannot send, and a script on another site needs a preflight
that this app never approves. The honeypot and the two rate limits (5 per
client address per 10 minutes, 5 per email per hour) bound scripted abuse.

## 3. The server action alternative

`requestPortfolioSite(prevState, formData)` from `@/app/actions/limelight`
runs the same code as the route. Use it with `useActionState`:

```ts
type PortfolioRequestState =
  | { ok: true; reference: string }
  | { ok: false; error?: ActionError; fieldErrors?: Record<string, ErrorKey> }
  | undefined;
```

Form field names are the JSON names: `name`, `email`, `performerType`,
`portfolioUrl`, `need`, `contactPref`, `phone`, `marketingOptIn`,
`consentVersion`, `source`, `locale`, `company`. Two details:

- Make `consentVersion` the `value` of the required consent checkbox. An
  unticked box then sends nothing, and the answer is
  `fieldErrors.consentVersion = "errors.consentRequired"`.
- `source` is `limelight-page` when the form has no such field.

`submitLimelightLead`, the action behind today's "Start your site" form, is
unchanged for the page: same field names, same return type. It now stores the
lead through the same code. Its `need` choice and its `message` are kept
together as the lead's `need` text ("redo: I would like...") when they fit in
500 characters; a longer message is left out and the server logs one line.
Its `budget` field is validated and then dropped: the lead table has no
column for it.

## 4. Owner view (to build)

The alert email holds the reference and the path `/admin/limelight?ref=...`,
and nothing about the person. That page does not exist yet. What it can call:

- `currentAdminId()` from `src/lib/limelight/admin.ts`: call it first, and
  answer `notFound()` when it returns null. The read below checks nobody.
- `listLimelightLeads({ status?, limit? })` from `src/lib/limelight/leads.ts`:
  newest first, each with `alert: "PENDING" | "SENT" | "DEAD" | null`.
- `setLeadStatus(leadId, "NEW" | "CONTACTED" | "CLOSED")`, a server action,
  admins only, audited.
- A download link to `/api/admin/limelight/leads.csv` (add `?status=NEW` to
  narrow it). Everyone but an admin gets a 404.

## 5. Sites: template and content

The schema is `SiteContent` in `src/domain/site.ts`; the six template ids are
`SITE_TEMPLATES` in the same file. Content is data, never HTML: a template
renders every value as text.

| Field | Rule |
|---|---|
| `name` | required, 80 characters |
| `headline` | 140 characters |
| `bio` | 2000 characters, line breaks allowed |
| `links[]` | up to 8, each `{ label (40), url }`, `https://` only |
| `credits[]` | up to 30, each `{ title (120), role (80), year? }` |
| `contactEmail` | optional, a plain email address |
| `mediaIds[]` | up to 12 ids of the owner's own media |

To add a field: add it to `SiteContent` with a length cap; give it a default
or make it optional, so stored sites still parse; add it to
`SITE_CONTACT_FIELDS` if it is a way to reach the performer; cover it in
`tests/domain/site.test.ts`. A link field uses `isWebUrl`, which refuses
every scheme except https.

Reads for pages, in `src/lib/sites.ts`: `listMySites(userId)` and
`getSiteForOwner(userId, siteId)` for the customer; `getSiteForOperator(siteId)`
and `listSitesForOperator()` for admin pages (after `currentAdminId()`). Each
site comes with `latestVersion`, `approvedVersion`, `publishedVersion` and
`showContact`.

## 6. Preview, approve, publish

Two roles. The **customer** owns the site. The **operator** is an admin.

| Step | Who | Call |
|---|---|---|
| Assemble the site | operator (or the customer) | `saveSite({ siteId?, ownerId?, template, content })`. An operator opens a new site for a customer with `ownerId`. Every save writes a new revision. |
| Preview | customer | A page that renders `getSiteForOwner(...)`: the draft is the latest revision. |
| Approve | customer only | `approveSitePreview(siteId, expectedVersion?)`. Pass the `latestVersion` the preview was rendered from. An operator gets `errors.forbidden`. |
| Publish | operator or customer | `publishSite(siteId)`. It puts the APPROVED revision online. Without an approval: `errors.siteNotApproved`. |
| Take offline | operator or customer | `unpublishSite(siteId)`. The address is kept for later. |
| Show contact details | customer only | `setSiteContactVisibility(siteId, true)`. Off by default. |

Edits made after an approval stay private. The public keeps seeing the
approved revision until the customer approves again and the site is
published again. If `approveSitePreview` answers `errors.confirmFailed`,
someone saved since the page was shown: reload the preview and ask again.

What the customer receives at the end: the address
(`<subdomain>.<root domain>`), control of their own domain if they connect
one (section 7), and their content. An export of that content as a file is
not built yet; see section 10.

Serving a site: `resolveSiteByHost(hostname)` in `src/lib/limelight/hosts.ts`
returns `{ siteId, template, content, showContact }` for a published site,
and `null` for everything else (unknown host, draft, unpublished, domain not
active). With `showContact` false the contact fields are already removed from
`content`.

## 7. A customer's own domain

The customer keeps the domain at their registrar and stays its owner. They
add two DNS records and can remove them at any time.

1. `addSiteDomain(siteId, hostname)` answers
   `{ ok: true, domainId, hostname, dns: { txtName, txtValue, cnameTarget } }`.
2. Show the customer the two records to create at their registrar:

   | Type | Name | Value |
   |---|---|---|
   | TXT | `_agental-verify.www.theirname.com` (`dns.txtName`) | `agental-site-verification=<token>` (`dns.txtValue`) |
   | CNAME | `www.theirname.com` | `dns.cnameTarget` |

   A bare domain (`theirname.com`) cannot hold a CNAME at most registrars.
   Recommend `www`, or the registrar's ALIAS or "CNAME flattening" record.
3. `verifySiteDomain(domainId)` looks for the TXT record. Until it is found
   the answer is `errors.domainNotVerified`; DNS changes can take a few hours.
4. An operator attaches the domain in the hosting dashboard, then calls
   `activateSiteDomain(domainId)`. Only then does the domain serve the site.
5. `removeSiteDomain(domainId)` disconnects it.

`listSiteDomains(siteId)` in `src/lib/limelight/domains.ts` gives the status
of each domain and its records again.

| Key | Meaning |
|---|---|
| `errors.domainInvalid` | Not a domain name, one of our own domains, or a reserved name. |
| `errors.domainTaken` | Another site already holds this hostname. |
| `errors.domainNotVerified` | The TXT record is not there yet. |
| `errors.forbidden` | A sixth domain on one site, or an attempt to remove the hosted subdomain. |

## 8. The change needed in `src/proxy.ts`

Unfinished: today a request for `ana-lee.<root domain>` reaches the app's
own pages. Two small pieces serve a site by hostname.

**In `src/proxy.ts`**, replace the default export. A request on a site's
hostname is rewritten to one internal page; every other request goes through
the locale middleware as today. The `config.matcher` stays as it is.

```ts
import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { limelightSiteHost } from "@/lib/limelight/hostname";

const intl = createMiddleware(routing);

export default function proxy(req: NextRequest) {
  if (limelightSiteHost(req.headers.get("host"))) {
    const url = req.nextUrl.clone();
    url.pathname = "/limelight-site";
    return NextResponse.rewrite(url);
  }
  return intl(req);
}
```

**One page outside `[locale]`**, `src/app/limelight-site/page.tsx`. It reads
the hostname from the request again, so it only ever renders on a site's own
hostname:

```ts
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { limelightSiteHost } from "@/lib/limelight/hostname";
import { resolveSiteByHost } from "@/lib/limelight/hosts";

export default async function LimelightSitePage() {
  const host = limelightSiteHost((await headers()).get("host"));
  const site = host ? await resolveSiteByHost(host) : null;
  if (!site) notFound();
  // Render the template: site.template, site.content, site.showContact.
}
```

How the two fit:

- `limelightSiteHost` is pure and imports no database code, so the proxy can
  use it. It answers a hostname only when `LIMELIGHT_ROOT_DOMAIN` is set and
  the host is a subdomain of it.
- Customers' own domains are routed only when `LIMELIGHT_APP_HOSTS` lists the
  app's hosts (comma-separated, each entry covers its subdomains). While that
  variable is empty, a host the app is served from can never be sent to the
  site page by mistake.
- On the app's own host, `/limelight-site` is a 404: the locale middleware
  moves it under `/en/`, where no such page exists.
- Paths the matcher skips (`/api/...`, `/_next/...`, files with an extension)
  are served as today on a site's hostname. Session cookies belong to the
  app's host, so those requests carry no session there.

## 9. Environment variables (names only)

| Name | Production | Preview | Local | When unset |
|---|---|---|---|---|
| `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` | set | set | set | The app does not start. `AUTH_SECRET` also keys the rate limit hashes. |
| `RESEND_API_KEY`, `EMAIL_FROM` | set | optional | leave empty | Alerts wait in the outbox. A missing key delays an alert and never uses it up. |
| `LIMELIGHT_ALERT_EMAIL` | set | optional | leave empty | Same: alerts wait. |
| `CRON_SECRET` | set | optional | leave empty | The drain route answers 404. |
| `LIMELIGHT_ROOT_DOMAIN` | set once the wildcard domain points at the app | optional | leave empty | Publishing records no hostname and hostname routing is off. |
| `LIMELIGHT_CNAME_TARGET` | optional | optional | leave empty | Customers are shown the root domain as the CNAME target. |
| `LIMELIGHT_APP_HOSTS` | only for routing customers' own domains | optional | leave empty | Customers' own domains are not routed by the proxy. |

The lead path stopped reading `LIMELIGHT_LEADS_WEBHOOK_URL` and
`N8N_SIGNING_SECRET`.

A scheduler has to call the drain route for retries to happen:
`GET /api/limelight/outbox/drain` with the header
`Authorization: Bearer <CRON_SECRET>`. That schedule is not set up yet. Until
it is, an alert is tried once, right after its lead is stored.

## 10. Off or in progress

- **Payments: off.** `LIMELIGHT.paymentsEnabled` is `false`.
  `startSiteCheckout` answers `errors.billingUnavailable` and creates no
  order; publishing asks for no order. The student price actions exist and
  only matter once payments are on.
- **`need`, `contactPref`, `phone`: validated, not stored yet.** The three
  columns are in the schema file and the migration; the code writes them once
  the switch `LEAD_DETAIL_COLUMNS` in `src/lib/limelight/leads.ts` is on,
  which waits for the migrated database and the regenerated client. Until
  then a request that carries them is stored without them and the server
  logs one line with the lead id. The owner list and the CSV already have the
  three columns; they are empty for now.
- **Hostname routing in the proxy: not done.** Section 8 is the change.
- **Automatic domain attach: not done.** An operator attaches each custom
  domain in the hosting dashboard by hand, then calls `activateSiteDomain`.
- **A separate database role for the `limelight` schema: not done.** The app
  uses its usual role for both schemas.
- **Moving `Site`, `SiteOrder` and `StudentPriceRequest` into `limelight`:
  not done.** They stay in `public` for now, so the migration only adds
  things. The four new tables are in `limelight`.
- **Retry schedule for alerts: not set up.** See section 9.
- **Owner view page (`/admin/limelight`): not built.** Section 4 lists what
  it can call.
- **Media on a public site: not built.** A published site carries
  `mediaIds`; nothing serves those files to a visitor yet.
- **Export for the customer: not built.** The data is there (the approved
  revision is JSON: a template id and `SiteContent`).
- **Revisions are never pruned,** and a save with no change still writes one.
- **`budget` of today's form is dropped,** and so is a `message` over the
  length the lead keeps. See section 3.

## 11. Migrations and rollback

Two migrations carry this work:

- `20261122000000_beta_server`: creates the `limelight` schema with four new
  tables (`LimelightLead`, `OutboxMessage`, `SiteDomain`, `SiteRevision`) and
  adds five columns to `public."Site"`. `Site`, `SiteOrder` and
  `StudentPriceRequest` stay in `public`. It also creates tables for other
  features (tapes, share links, briefs, drafts, workflow runs).
- `20261122010000_account_timestamps`: two columns on `public."Account"`. It
  holds nothing for Limelight.

Both only add things: new tables, and new columns that are empty or have a
default. The code from before this work therefore runs on the migrated
database, and going back one release needs no SQL at all.

### Removing the Limelight tables (owner only)

**For the owner of the database, with a backup taken first.** This deletes
every lead, alert, site revision and site domain for good. It undoes the
Limelight part of `20261122000000_beta_server` and leaves that migration's
other tables alone, so the migration history row stays as it is. Deploy the
code from before this work first: the current code needs these tables.

```sql
BEGIN;

-- 1. The four tables this work added. Their rows are lost.
DROP TABLE IF EXISTS "limelight"."SiteRevision";
DROP TABLE IF EXISTS "limelight"."SiteDomain";
DROP TABLE IF EXISTS "limelight"."OutboxMessage";
DROP TABLE IF EXISTS "limelight"."LimelightLead";

-- 2. The five columns added to Site.
ALTER TABLE "public"."Site"
  DROP COLUMN IF EXISTS "approvedRevisionId",
  DROP COLUMN IF EXISTS "approvedAt",
  DROP COLUMN IF EXISTS "approvedById",
  DROP COLUMN IF EXISTS "publishedRevisionId",
  DROP COLUMN IF EXISTS "showContact";

-- 3. The schema is empty now. Without CASCADE this fails if anything is
--    left in it, which is the check you want.
DROP SCHEMA "limelight";

COMMIT;
```

### A database migrated with the earlier draft

An earlier draft of `20261122000000_beta_server` moved `Site`, `SiteOrder`
and `StudentPriceRequest` into `limelight`. Local and test databases created
during this work may be in that state (check with
`SELECT table_schema FROM information_schema.tables WHERE table_name = 'Site';`).
On such a database, move the three tables back first, then run the block
above with `"limelight"."Site"` already back in `public`:

```sql
BEGIN;
-- SET SCHEMA keeps rows, indexes, constraints and Row Level Security.
ALTER TABLE "limelight"."StudentPriceRequest" SET SCHEMA "public";
ALTER TABLE "limelight"."SiteOrder" SET SCHEMA "public";
ALTER TABLE "limelight"."Site" SET SCHEMA "public";
COMMIT;
```

After the tables are removed, a site that was online reads as PUBLISHED with
no revision behind it. Set those back to DRAFT if the older code should treat
them as offline:

```sql
UPDATE "public"."Site" SET "status" = 'DRAFT' WHERE "status" = 'PUBLISHED';
```
