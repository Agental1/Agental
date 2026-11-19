# Deals on the talent dashboard: what n8n needs

The site now shows deals waiting for a talent's answer and sends Accept or
Decline back to the workflow "Agental A" (webhooks `deals/pending` and
`deals/decision`). Code: `src/lib/n8n/deals.ts`, `src/app/actions/deals.ts`,
`src/components/talents/deals-panel.tsx`.

## Why the workflow needs a change first

Today `deals/pending` returns every waiting deal in the `tasks` table, with
nothing that says which talent it belongs to. The site therefore shows a deal
only when its row carries the talent's `actor_ref`. Until the workflow adds
it, the panel shows no deals, by design.

`actor_ref` is a pseudonym: an HMAC of the talent's profile id under
`N8N_SIGNING_SECRET`. n8n never sees a name, email or account id.

## Changes in n8n (on a `-dev` copy first)

1. Add a column `actor_ref` (string) to the `tasks` data table.
2. When a deal is saved as "waiting for actor" (node 7b, "Save Deal As Waiting
   For Actor"), write the talent's `actor_ref` into that column. The site
   admin can read a talent's ref with `actorRef(profileId, secret)` in
   `src/lib/n8n/deals.ts`; a lookup table of actor_ref per talent is the
   cleaner long-term option.
3. `deals/pending`: add the condition `actor_ref = {{ $json.query.actor_ref }}`
   to "2. Get Waiting Deals", and add `actor_ref: i.json.actor_ref` to the
   response mapping in "3. Send Deals To Website".
4. `deals/decision`: in "2. Find The Deal", add the condition
   `actor_ref = {{ $json.body.actor_ref }}`, so a decision only matches the
   talent's own deal.
5. Header Auth credential on both webhooks: header name `x-agental-key` (or
   set `N8N_WEBHOOK_AUTH_HEADER`), with a long random value.

## Site configuration (Vercel and `.env`)

    N8N_WEBHOOK_BASE_URL=https://agental.app.n8n.cloud/webhook
    N8N_WEBHOOK_AUTH_HEADER=x-agental-key
    N8N_WEBHOOK_AUTH_VALUE=<the credential value>
    N8N_SIGNING_SECRET=<long random string>

With any of these missing, the panel stays hidden and nothing is sent.

## What stays true

- The talent always answers first. Accept or Decline only updates the deal;
  the workflow drafts the email to the casting director and a person sends it.
- Each decision is written to the audit log (`deal.accepted` / `deal.declined`).
