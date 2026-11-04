# Agental architecture: four compartments

Each compartment may talk only to its neighbour. Nothing reaches around.

```
 Frontend  ->  Backend  ->  Supabase  <-  n8n (restricted role, "automation" schema only)
                  |                          ^
                  +------ signed webhooks ---+
```

| Compartment | Lives in | May know | Must never know |
|---|---|---|---|
| **Frontend** | `src/app/**/page.tsx`, `src/components`, `messages` | What the backend returns to the signed-in user | Database, secrets, other users' data |
| **Backend** | `src/app/actions`, `src/app/api`, `src/lib`, `src/domain` (to become `src/server`) | Everything about accounts; the mapping between a person and their pseudonym | n8n credentials beyond one signing secret |
| **Supabase** | Postgres + (later) row-level security | Data only. It enforces access with roles. | Business decisions |
| **n8n** | n8n Cloud + `automation/` | Pseudonymous casting data (below) and the owner mailbox | Any name, email, phone, photo, birth date, password or account id of an actor, talent or staff member |

## The n8n compartment (strict)

n8n is the most exposed system: third-party nodes, AI providers, execution logs that store every item that passes through. So it gets the least.

1. **Pseudonyms only.** Each actor has a random `actor_ref` (UUID) that is unrelated to their account id. The mapping `actor_ref <-> profile` exists only in the `private` schema, which n8n cannot read.
2. **Matching attributes only.** n8n receives playing-age range, gender as relevant to roles, languages, accents, specialties, skills, country/city, travel ability, minimum rate. It does not receive legal name, stage name, birth date, email, phone, photos, bio or free text.
3. **No contact details of people working on Agental.** The only personal email n8n knows is the owner mailbox of the n8n account itself. Outgoing drafts are created in that mailbox. Actor and staff addresses never enter n8n.
4. **Templates, not identities.** n8n writes application text with placeholders such as `{{ACTOR_NAME}}`. The backend fills them in, only after the person approved the application in the site.
5. **Own database role.** n8n connects as `n8n_worker`, which can use only the `automation` schema. It cannot read `public` (accounts) or `private` (the mapping).
6. **One-way triggers.** The backend calls n8n webhooks and n8n calls backend endpoints, both signed (HMAC). Neither holds the other's database password.
7. **Studio contacts are third-party public data** (listing emails). They stay in `automation` tables and are never linked to a user.
8. **Execution logs:** keep n8n execution data retention short and avoid saving successful production executions, so pseudonymous data does not pile up in logs.

## Data boundaries in Supabase

- `public`: Prisma tables (accounts, profiles, projects). Row-level security ON, no policies, no grants to `anon`/`authenticated`. Only the backend connects (a role that bypasses RLS).
- `private`: `actor_refs` mapping. Backend only.
- `automation`: what n8n reads and writes. See `docs/drafts/automation-schema.sql` (a draft, not applied).

## Rules for code

- A frontend file never imports `@/lib/db` or `@/generated/prisma`.
- Every exported function of a `"use server"` file is a public endpoint: authenticate and authorize inside it, and keep helpers un-exported.
- Secrets live in Vercel/n8n settings, never in the repo.
- No new external dependency without the same interface-plus-loud-failure pattern used for billing, storage and scoring.
