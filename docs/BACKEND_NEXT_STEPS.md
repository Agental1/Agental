# Backend next steps: prompt for Claude Code

Paste everything below the line into Claude Code, opened at the root of this
repository, in plan mode. It is written for Claude; the human running it only
needs to supply access and answer the questions it asks.

---

## Who you are and what you are doing

You are the backend engineer for Agental, an AI-augmented talent agency (US
first, France in parallel). The frontend of the talent side was just reworked
and a new page, Limelight (websites for performers), was added. Your job is to
connect the website to its backend and to the n8n workflows, step by step,
without breaking anything that already works.

Work in plan mode until the plan for the current task is approved. One branch
and one pull request per task, each with a "how to test" note.

## Read first

1. `AGENTS.md`, `CLAUDE.md` and `README.md` at the repo root. This is Next.js 16
   (App Router, webpack) and its conventions differ from older versions: read
   the guides in `node_modules/next/dist/docs/` before writing Next code.
2. `CHANGELOG.md`, section "Unreleased": everything changed in the last round.
3. The stack, as found in the code: next-intl with four locales (en, fr, es, zh;
   every message key must exist in all four, checked by `bun run i18n:check`),
   Prisma 7 on PostgreSQL (Supabase in production), Cloudflare R2 for media
   (`src/lib/storage`), NextAuth v5 (`src/auth.ts`), deployment on Vercel. The
   Anthropic SDK is already a dependency. Outside the code: n8n self-hosted on
   Hostinger, and a Resend account for email (not wired into the code yet).
4. Server actions return a translation key, never a sentence
   (`src/domain/action-result.ts`). Navigation imports come from
   `@/i18n/navigation`. Locale negotiation lives in `src/proxy.ts`.

## Ground rules

- Do not change prices, plan names or commission rates (`messages/*/talents.json`
  `pricing`, `src/domain/pricing.ts`), the casting portal's look, or the auth,
  media-access and storage code unless a task below says so.
- Secrets live in `.env` locally and in Vercel project settings. Never ask for a
  key in chat, never print one, never commit one.
- n8n: build on a copy of a workflow (suffix `-dev`), export it as JSON into a
  new `n8n/` folder of the repo, and change a live workflow only after the
  founder (Jérôme) or Solal approves.
- Nothing goes to a talent, a casting director or a studio automatically: the
  existing workflows only create drafts, and that stays true.
- Before each pull request: `bun run typecheck`, `bun run lint`, `bun run test`,
  `bun run i18n:check`, and a production build (`bun run build`).
- V1 serves adults only.

## Where things stand

**Limelight form.** `/[locale]/talents/limelight` ends with a "Start your site"
form (`src/components/talents/limelight-contact-form.tsx`). It posts to the
server action `src/app/actions/limelight.ts`, which validates with
`src/domain/limelight.ts`, applies a honeypot and a per-visitor limit (5 per 10
minutes, in memory), then:

- if `LIMELIGHT_LEADS_WEBHOOK_URL` and `N8N_SIGNING_SECRET` are both set, POSTs
  the lead as JSON to that URL with header
  `x-agental-signature: sha256=<hex HMAC-SHA256 of the raw body, keyed with N8N_SIGNING_SECRET>`;
- otherwise runs in mock mode: logs discipline, need, budget and locale on the
  server (no personal data) and shows the visitor a success message.

Payload fields: `name, email, discipline, need, budget, contactPref, phone,
message, locale, source ("limelight"), receivedAt`.

**n8n workflow "Agental A - Casting Research, Actor Matching and Draft
Applications"** (94 nodes; ask Jérôme for the JSON export, or export it from
n8n). It has three parts: email negotiation and customer service (Gmail
drafts), casting research and actor matching (Perplexity, Jev or Luna models,
Gmail drafts, data tables), and two webhooks meant for the website:

- `GET deals/pending`: returns deals waiting for the actor (data table "tasks");
- `POST deals/decision`: records the actor's accept or deny, then drafts the
  email to the director.

Both webhooks are set to Header Auth, but the export shows no credential
attached to them. Check this first: without a credential they may be unusable
or unprotected.

**The website does not call any n8n webhook yet.**

## Tasks, in order

### Task 0: run it and deploy a preview

1. `bun install`, copy `.env.example` to `.env`, fill the database and auth
   values (see README). If `prisma generate` cannot download its engines, report
   it rather than working around checksums in production.
2. Create a branch, push, and confirm Vercel builds a preview deployment.
3. Click through the preview on a phone and a laptop: the Talents | Casting
   switch in the header, the "Websites" link, the five clickable steps, and the
   Limelight form (it should say thanks, in mock mode).

Done when the preview URL works and Jérôme has seen it.

### Task 1: store Limelight leads in the database first

A lead must survive n8n being down.

1. Propose a Prisma model, for example `LimelightLead` (id, createdAt, name,
   email, discipline, need, budget, contactPref, phone, message, locale,
   status `new | contacted | closed`, forwardedAt nullable). Add a migration.
2. In `submitLimelightLead`, write the row first, then forward to n8n, then set
   `forwardedAt`. If forwarding fails, keep the row and still thank the visitor;
   log the failure.
3. Add a simple list of leads to the existing admin area (`/[locale]/admin`),
   admin role only, following how the other admin pages check access.
4. Tests: validation, honeypot, limit, and "row saved even when the webhook
   fails".

### Task 2: build the n8n workflow "W2 Limelight lead"

1. Webhook node: POST, path `limelight/lead`, with the raw body enabled so the
   signature can be checked on the exact bytes.
2. Code node: recompute the HMAC-SHA256 of the raw body with the shared secret
   and compare it to `x-agental-signature` in constant time; answer 401 and stop
   if it differs. On self-hosted n8n the Code node needs the `crypto` module
   allowed (`NODE_FUNCTION_ALLOW_BUILTIN=crypto` on the n8n server).
3. Then: notify the team (Gmail draft or email to the team address) and send
   the talent a short, warm confirmation through Resend, in the lead's
   `locale`. Formal register for emails, as in the existing customer service.
4. Put the production webhook URL and the secret in Vercel
   (`LIMELIGHT_LEADS_WEBHOOK_URL`, `N8N_SIGNING_SECRET`), redeploy the preview,
   and send one real test lead end to end.

Done when a lead submitted on the preview arrives in the database, reaches n8n
with a valid signature, and both emails are produced.

### Task 3: connect the existing deal webhooks to the talent dashboard

1. Attach a Header Auth credential to `deals/pending` and `deals/decision` in
   n8n; store the same value in Vercel as `N8N_DEALS_TOKEN`.
2. On the website, call them only from the server (a server action or route
   handler), never from the browser, and only for the signed-in talent who owns
   the deal. Confirm how the data table identifies the actor and map it to the
   app's user or profile id; ask before guessing.
3. Show pending deals in the talent space (`/[locale]/talents/app`) with Accept
   and Decline. Nothing is sent to a director until the talent decides.
4. Handle errors in plain language, in all four locales.

### Task 4: Limelight phase 2 (ask before starting)

Photo upload and site generation. Reuse `src/lib/storage` (R2) for photos;
strip location metadata on upload; crop and compress only, never retouch a
face. Draft the bio with the Anthropic SDK from the talent's own answers only,
and let the talent approve every word. Payment stays off: Stripe in test mode
only, until the lawyer signs off on the offer. Prices live in
`src/domain/limelight.ts` and the message files: Essential $99, Signature $199,
hosting $49 or $79 a year after year one.

### Later: the self-tape coach

Planned after Task 4. Do not start it in this round.

## Questions to ask Jérôme before Task 1

- Which email address should receive Limelight leads?
- Should leads go to Gmail drafts (like the current workflows) or be sent
  directly to the team?
- Who can see the admin list of leads?
- Where should published performer sites live: `agental.site` subdomains, or
  under `agental.co`?
