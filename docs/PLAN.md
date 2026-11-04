# Agental build plan

Goal: a website where actors have accounts, stored in Supabase; n8n finds castings and
writes results back to Supabase; the backend reads those results and fills each actor's
dashboard. n8n never learns who anyone is (`docs/ARCHITECTURE.md`).

Order: finish the website first. Nothing real is connected to n8n until the website can
hold real accounts safely and an actor can give or withdraw consent.

Legend: **[you]** needs an account, credential, legal text or a product decision.
Everything else I can do in this repo.

---

## Stage 1 — Make the website safe for real accounts

Blockers. None of this is visible in the UI; all of it has to be true before the first
real actor signs up.

| # | Work | Why | Where |
|---|---|---|---|
| 1.1 | **[you]** Purge demo accounts from production | `demo-admin@demo.agental.co` has a published password and admin rights over audit logs, minors' files and all media | `bun run db:purge-demo` (dry run), then `-- --apply` |
| 1.2 | Login rate limiting + lockout | No limit today: passwords can be guessed at full speed | new table, `src/auth.ts` |
| 1.3 | Real email verification | `finalizeCastingOnboarding` sets `emailVerified` itself (`casting-onboarding.ts:120`). The gate certifies nothing | new token table, email sender **[you: provider]** |
| 1.4 | Real SIRET check | `verifySiret` accepts any 14 digits as `VERIFIED` (`casting-onboarding.ts:35`). Any 14 digits buys access to talent data | INSEE Sirene API **[you: API key]** |
| 1.5 | Direct-to-R2 uploads | Server actions carry the file through the function; Vercel caps the request at a few MB, so self-tapes fail in production | `actions/media.ts`, `actions/selftape.ts`, new signed-upload endpoint |
| 1.6 | Delete R2 files on account delete | `deleteMyAccount` drops database rows only; photos and self-tapes stay in the bucket. GDPR gap | `actions/account.ts` |
| 1.7 | Minor-case steps → admin only | **[you: decision]** A studio can mark prefectoral authorization `GRANTED` and escrow `HELD` itself (`actions/minors.ts`). Studios should request; Agental grants | `actions/minors.ts`, `admin/mineurs` |
| 1.8 | Commission rate per plan | Hard-coded `0.1` (`actions/onboarding.ts:147`); Premium 7.5% and Ultimate 5% are sold but never applied | `actions/onboarding.ts` |
| 1.9 | Legal pages | **[you: the text]** Footer renders "mentions légales / CGU / confidentialité" as dead text (`footer.tsx:90`). A declared agency needs them | new routes + 4 locales |

Done when: demo accounts gone, a 50 MB self-tape uploads in production, deleting an
account leaves no files, and `bun run typecheck && bun run test && bun run i18n:check` pass.

## Stage 2 — Repo into four compartments

Mechanical, no behaviour change. Do it before adding features so the new code lands in
the right place.

- `src/server/**` — everything that touches the database or decides permissions
  (today's `actions`, `lib`, `domain`).
- `src/app/**`, `src/components/**`, `messages/**` — frontend. May import only from `src/server`'s
  public entry points, never `@/lib/db` or `@/generated/prisma`.
- `supabase/**` — migrations, roles, row-level security.
- `automation/**` — n8n workflow exports and the portal worker (already drafted in
  `../portal-worker`).
- ESLint rule enforcing the import boundary, so the separation can't quietly rot.
- Schema hygiene in the same pass: indexes on foreign keys, unique index on
  `(projectId, artistProfileId)` so the shortlist can upsert instead of reconciling in
  code, drop the libSQL/SQLite leftovers from `next.config.ts` and `package.json`.

## Stage 3 — Consent, and the actor's own dashboard

The website side of the chain, built before any real data flows. Empty states first.

- **Automation consent**, per actor: off by default, withdrawable, stored on the profile
  and shown in `app/parametres`. No profile reaches n8n without it. This is what makes
  Stage 5 lawful rather than merely working.
- **Opportunities screen** at `talents/app/opportunites`: the castings matched to this
  actor, with approve / decline. Reads from Supabase, so it works before n8n fills it.
- **Notifications**: the `Notification` table has zero readers today, so a registered
  actor is never contacted by anything. Add the bell, the list, and the writes.
- **Application review**: the actor sees the draft text, edits it, approves. Approval is
  the only moment their name and email are added — by the backend, never by n8n.

## Stage 4 — Supabase foundation

- **[you]** Create a second Supabase project for test/preview, so a test branch can never
  touch real accounts. Send me the project name only, never a password.
- Turn `docs/drafts/automation-schema.sql` into a real migration: `private.actor_refs`
  (the pseudonym mapping, backend only), the `automation` schema tables, the `n8n_worker`
  role, row-level security on the existing `public` tables.
- Apply to the test project first, verify from the n8n role that `public` and `private`
  are unreachable, then production.
- **[you]** Set the Vercel environment variables per environment (production, preview)
  and keep the n8n role's password only in n8n.

## Stage 5 — Join n8n to Supabase

Still draft-only and still confined to workflow `bqvkO358y9PRJfDY`.

- Backend publishes consenting actors as pseudonymous rows into
  `automation.actor_profiles` (attributes only: playing age, languages, accents,
  specialties, city, travel, minimum rate).
- Workflow reads actors from Supabase instead of the 11 fictional profiles, and writes
  castings, evaluations and draft text into `automation.*` instead of its own data tables
  (~1,584 rows today).
- Application text uses `{{ACTOR_NAME}}` placeholders. Drafts stay drafts.
- Signed (HMAC) calls both ways; neither side holds the other's database password.
- Short execution-data retention in n8n, so pseudonymous rows don't accumulate in logs.
- Keep the fictional actors as a test set alongside the real ones.

## Stage 6 — Close the loop

- Backend reads `automation.evaluations`, maps each one back to the real actor through
  `private.actor_refs`, and creates the opportunity rows and notifications the dashboard
  already renders.
- Actor approves → backend fills in their identity → Gmail draft or portal draft.
- Then, and only then, decide whether anything is ever sent without a human clicking.

## Stage 7 — Launch

- Stripe, replacing `MockBilling` behind the same interface (the guard added in Stage 1
  refuses paid plans until then).
- Error monitoring, uptime checks, database backups verified by restoring one.
- The two known blocked sources (Backstage, Casting Networks return 403 to the page
  reader) and the thin-profile problem: both need real profiles and, for the blocked
  sites, authorized accounts.
- Portal form worker deployed, sandbox-tested, still fill-and-stop.
- End-to-end rehearsal on the test project with one real consenting actor.

---

## What I need from you to start

1. Run `bun run db:purge-demo` against production and read the dry run (1.1).
2. Decision on 1.7: should studios be able to grant prefectoral authorization themselves?
3. The legal text for 1.9, or a lawyer's draft.
4. Whether the GitHub repo and Vercel project already exist, and whether the live domain
   is agental.co.

I can do Stage 1 items 1.2, 1.5, 1.6, 1.8 and Stage 2 without any of that.
