# Data security

Where Agental's data lives, how sensitive each part is, what protects it today and what comes next. Production is a single Supabase project in eu-west-1; its project ref is kept in the team's private notes. The dev setup is in [SUPABASE_ENVIRONMENTS.md](SUPABASE_ENVIRONMENTS.md) and photo and video storage in [MEDIA_HOSTING.md](MEDIA_HOSTING.md).

## Where the data lives

| System | What it holds | Who reaches it today |
|---|---|---|
| Supabase Postgres, schema `public` | The 28 tables classified below: accounts, profiles, mandates, projects, shortlists, billing state, audit log | The app, through Prisma as `postgres`, the owner of every table, via the pooler. RLS is on, and the lock migration takes every privilege away from `anon` and `authenticated`. |
| Cloudflare R2, bucket `agental-media` (EU) | Photos, videos, self-tapes and audio under `media/{profileId}/` and `selftape/{profileId}/` | The app, with one API token. A browser gets a 5-minute signed URL once `canReadMedia` (`src/lib/media-access.ts`) allows the read. |
| n8n Cloud | The `tasks` data table (deals waiting for a talent's decision), casting research, execution logs | n8n credentials, and webhooks signed with HMAC. The target is pseudonymous data only ([ARCHITECTURE.md](ARCHITECTURE.md)); check what `tasks` holds today before relying on that. |
| Google Workspace | Gmail drafts and threads written by n8n (negotiation, customer service), team Docs and Sheets | Whoever has the Google account. Any file with a person's name or contact details is T2. |
| Vercel | Environment variables (every secret), build logs, runtime logs | Project members. Runtime logs keep whatever `console.*` prints, error objects included, so log lines must leave out emails, names and IP addresses. |
| Anthropic API | Only with `SCORER=llm`: each candidate's stage name, age, city, languages, accents, specialties and minimum rate (`src/lib/ai/llm-scorer.ts`) | The API key in Vercel. The default scorer is the local mock. |

## Tiers

- **T1 Identity and credentials**: how a person is recognized and signs in.
- **T2 Personal data**: what talents and users tell us, and what we derive about them.
- **T3 Legal**: evidence of the mandate and of what was proposed to whom.
- **T4 Financial**: plans, fees, commissions, usage, payment events.
- **T5 Media metadata**: rows that point at files in R2. The files themselves are T2.
- **T6 B2B**: casting organizations, their members, seats and projects.
- **Internal**: Prisma's own bookkeeping.

## The 28 tables

Two migrations give every table the same baseline. `20261118000000_enable_rls` enables RLS with no policies, and `20261119000000_lock_public_grants` removes the privileges of `anon` and `authenticated` on current and future objects. The app connects as the owner, so RLS never applies to it and every access rule lives in server code. "Baseline" in the Today column means exactly that and nothing more. In the last column, "app full" means SELECT, INSERT, UPDATE and DELETE for the `agental_app` role described further down, with its `app_all` policy.

| Table | Tier | Holds | Today | Next step |
|---|---|---|---|---|
| `User` | T1 | Email, bcrypt password hash, name, kind, `isAdmin`, locale | Baseline. The hash is left out of the data export (`src/app/actions/account.ts:42`). | App full. `isAdmin` opens every talent's media (`src/lib/media-access.ts:35`), so keep the admin list short and check it on each environment (see Checks). |
| `Account` | T1 | Google or Apple subject for a user | Baseline. Created at sign-in without provider tokens (`src/lib/auth/resolve-oauth-user.ts:118-124`). | App full, with the token columns kept empty. |
| `Session` | T1 | Database sessions | Unused: sessions are JWTs and there is no adapter. | App full, or nothing while it stays unused. |
| `VerificationToken` | T1 | Email verification tokens | Unused. | Same as `Session`. |
| `Invitation` | T1 | Invitee email and a bearer token | Unused. | App full. |
| `ArtistProfile` | T2 | Stage and legal name, birth date, `isMinor`, phone, city, bio, physical traits, minimum rate | Baseline. | App full. |
| `Specialty` | T2 | Skills and levels | Baseline. | App full. |
| `Availability` | T2 | Dates and zones | Baseline. | App full. |
| `Thread` | T2 | Thread subjects | Baseline. | App full. |
| `Message` | T2 | Message bodies and attachments | Baseline. | App full. |
| `Notification` | T2 | Payload JSON | Unused. | App full. |
| `MatchScore` | T2 | Score, reasons, factors, `diversityFlags` | Baseline. | App full. `diversityFlags` is profiling about a person: it may appear in that person's own data export, and stays out of logs, n8n and anything sent to a third party. |
| `ExternalTalent` | T2 | People who never signed up: name, agency, a JSON blob of features | Baseline. Every brief reads all rows, with no tenant filter (`src/app/actions/brief.ts:111`). | Add an organization column and filter first (TODOS.md, B16), then app full. |
| `MinorCase` | T2 | Guardian contact, authorizations, escrow | Baseline. Written by casting organization owners (`src/app/actions/minors.ts`), listed in `/admin`. | Revoke everything from `agental_app` while V1 serves adults only. That breaks `src/app/actions/minors.ts`, `/admin/mineurs` and the minors count on `/admin`, so remove or guard those first. |
| `Mandat` | T3 | Status, document version, `signedAt`, `signatureIp`, `revokedAt` | Baseline. In the app only `signMandat` writes it, and it is deleted with the profile (`prisma/schema.prisma:187`). | SELECT and INSERT, UPDATE on five columns only (below). Retention is an open decision (last section). |
| `AuditLog` | T3 | Who did what, with before and after JSON; the mandate signature IP sits in `after` | Baseline. Append-only by convention: the code only ever creates rows (`src/lib/audit.ts`). | SELECT and INSERT only. |
| `Candidature` | T3 | Who was proposed for which project, status, timeline | Baseline. Rematching deletes stale rows (`src/app/actions/brief.ts:186-189`). | Drop DELETE once rematching marks stale rows with a status instead. |
| `Subscription` | T4 | Plan, price, commission rate, Stripe id | Baseline. Billing is still the mock, so the app holds no card data. | App full. |
| `UsageCounter` | T4 | Monthly counters per user or organization | Baseline. | App full. |
| `CareerEntry` | T4 | Role, fee, commission | Baseline. | App full; consider dropping DELETE. |
| `WebhookEvent` | T4 | Payment provider events | Unused. | SELECT and INSERT, UPDATE on `processedAt` only. |
| `Media` | T5 | R2 key, mime type, order, primary flag | Baseline. Files are served only after `canReadMedia`, through 5-minute signed URLs. | App full. Add `sizeBytes` and a unique `storageKey` ([MEDIA_HOSTING.md](MEDIA_HOSTING.md)). |
| `SelfTape` | T5 | Take number, quality score, status, project | Baseline. | App full. |
| `Organization` | T6 | Name, SIRET, scope, plan, Stripe customer id | Baseline. | App full. |
| `Membership` | T6 | User, organization, role | Baseline. | App full. |
| `Seat` | T6 | Seat status | Baseline. | App full. |
| `Project` | T6 | Title, role spec, dates, budget, brief files | Baseline. | App full. |
| `_prisma_migrations` | Internal | Applied migrations | Baseline. | Owner only: `agental_app` gets nothing. |

The n8n role planned in [ARCHITECTURE.md](ARCHITECTURE.md), `n8n_worker`, gets nothing in `public` either. It reads and writes the separate `automation` schema only.

## What RLS covers here

RLS without policies, together with the revoked grants, closes every path that goes through Supabase's API roles:

- the Data API (PostgREST) and GraphQL, called with the anon key or with a signed-in user's JWT;
- Realtime subscriptions on these tables;
- any future supabase-js code that uses the anon key;
- a future role without BYPASSRLS, such as `agental_app`: a table it has no policy on returns zero rows to it and refuses its inserts.

Each of the two measures is enough on its own, so a table that loses RLS by mistake still stays closed to the anon key.

These stay open and need their own controls:

- The app itself. Prisma connects as `postgres`, the owner, so RLS never applies to it. Who may see what is decided in server code (`auth()` in each server action, `canReadMedia` for media), and a missing check there is a leak that RLS cannot catch.
- A leaked `DATABASE_URL` or `postgres` password, which gives full access.
- A leaked `service_role` key. It bypasses RLS and keeps its grants, since the lock migration leaves it alone. Turning off the Data API for `public` (Supabase dashboard, API settings) closes that path, and so would revoking table privileges from `service_role`. Both wait for a decision on `backend/`, which is built on supabase-js.
- People with access to the Supabase dashboard.
- R2, n8n, Google Workspace and Vercel logs, which sit outside Postgres.

FORCE ROW LEVEL SECURITY stays off while the app connects as the owner. Forcing applies RLS to the owner as well, and with no policies Prisma would read nothing. `_prisma_migrations` keeps it off in every case, since Prisma reads that table on each deploy.

`backend/`, the separate Supabase app, relies on grants to `authenticated` in `public`, `auth.uid()` and supabase-js. The lock migration revokes `anon` and `authenticated` on everything in `public`, so that app needs its own project or its own exposed schema if it ever shares this database.

## Checks

Run these in the Supabase SQL editor after a deploy, on dev first. The first four should return no rows.

```sql
-- 1. Tables in public without RLS (Prisma's own table excepted).
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
  and c.relname <> '_prisma_migrations' and not c.relrowsecurity;

-- 2. Tables or views that anon or authenticated can still touch.
select c.relname, r.rolname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join (values ('anon'), ('authenticated')) as r (rolname)
where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
  and has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE');

-- 3. Default privileges that would hand them objects postgres creates later.
--    Supabase keeps similar defaults for supabase_admin, which only cover
--    objects that role creates, hence the filter on postgres.
select defaclobjtype, defaclacl
from pg_default_acl
where defaclnamespace = 'public'::regnamespace
  and defaclrole = 'postgres'::regrole
  and defaclacl::text ~ '(^|[{,])(anon|authenticated)=';

-- 4. Forced RLS anywhere in public.
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relforcerowsecurity;

-- 5. Who bypasses RLS: service_role does by design, postgres may or may not.
select rolname, rolsuper, rolbypassrls from pg_roles
where rolname in ('postgres', 'anon', 'authenticated', 'service_role');

-- 6. Admins. Every row should be a real member of the team.
select email from "User" where "isAdmin";
```

Demo accounts from `prisma/seed.ts` share a published password and include an admin. They belong in dev only; `bun run db:purge-demo` lists them and `bun run db:purge-demo -- --apply` removes them.

## Next step: a least-privilege role for the app

Today any query the app runs, a buggy one included, runs as the owner. A dedicated role without BYPASSRLS limits it to the tables, columns and statements the app needs, and it is what makes the column rules in the table above enforceable. Row filtering per end user stays in server code: Postgres cannot tell which person is behind a pooled connection, so the policy lets the app role see every row, as it does today.

**1. Create the role by hand, in each environment, dev first.** Use the SQL editor and take the password from the team password manager. The repository is public, so this SQL never goes in a migration.

```sql
create role agental_app login password '<from the password manager>'
  nosuperuser nobypassrls noinherit nocreatedb nocreaterole;
grant usage on schema public to agental_app;
grant select, insert, update, delete on all tables in schema public to agental_app;
revoke all on table public._prisma_migrations from agental_app;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to agental_app;
```

**2. Add a policy migration.** It returns early where the role does not exist, so `prisma migrate deploy` keeps working everywhere. Where the role is created after the migration already ran, paste the same block into the SQL editor; it is idempotent.

```sql
DO $$
DECLARE t record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agental_app') THEN
    RETURN;
  END IF;

  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname <> '_prisma_migrations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS app_all ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY app_all ON public.%I FOR ALL TO agental_app USING (true) WITH CHECK (true)',
      t.relname
    );
  END LOOP;

  -- Revoke on the table first: a column-level REVOKE under a table-level
  -- grant changes nothing. Then grant back only the columns.
  REVOKE UPDATE, DELETE ON "AuditLog" FROM agental_app;
  REVOKE UPDATE, DELETE ON "Mandat" FROM agental_app;
  GRANT UPDATE (status, "revokedAt", "signedAt", "signatureIp", "documentVersion")
    ON "Mandat" TO agental_app;
  REVOKE UPDATE, DELETE ON "WebhookEvent" FROM agental_app;
  GRANT UPDATE ("processedAt") ON "WebhookEvent" TO agental_app;
END $$;
```

The `Mandat` columns are the ones `signMandat` writes when it signs a revoked mandate again (`src/app/actions/onboarding.ts:163-172`): `status`, `signedAt`, `signatureIp` and `revokedAt`. A first signature is an `INSERT ... ON CONFLICT DO NOTHING`, which needs INSERT only. `documentVersion` is there for re-signing a new version of the document. Foreign key cascades run with the owner's rights, so deleting an account still removes the `Mandat` row although `agental_app` has no DELETE on it; the last section deals with that.

**3. Switch the app on dev.** In `DATABASE_URL`, use the user `agental_app.<project ref>` on the pooler, port 6543. `DIRECT_URL` keeps `postgres`, because migrations run DDL as the owner. Run the tests, then go through signup, onboarding, the mandate, an upload and a casting brief by hand. Production follows once dev holds. Rolling back means restoring the previous `DATABASE_URL` and redeploying.

**4. Keep it complete.** Each migration that creates a table must also enable RLS on it (`tests/db/migration-guards.test.ts` fails otherwise) and add its `app_all` policy with the same guard. A table that lacks the policy returns zero rows to the app role and refuses its inserts. This query lists the tables that still lack one; run it in CI or after each deploy:

```sql
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
  and c.relname <> '_prisma_migrations'
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
      and 'agental_app' = any (p.roles)
  );
```

The SQL in this section and in Checks was run against an in-memory Postgres 17 with Supabase-like roles. Run it on the dev project before production all the same.

## Open legal decision: the mandate after account deletion

`deleteMyAccount` deletes the user (`src/app/actions/account.ts:92`). `ArtistProfile` cascades from `User` (`prisma/schema.prisma:100`) and `Mandat` cascades from `ArtistProfile` (`prisma/schema.prisma:187`), so the signed mandate, with its version, date and IP address, disappears with the account. Database privileges cannot prevent that, since cascades run as the owner. The `mandat.sign` audit entry survives, with the signature IP in `after` (`src/app/actions/onboarding.ts:202-211`, written in the same transaction as the signature): deletion only clears its actor (`prisma/schema.prisma:364`).

Counsel has to pick one of two rules before real talents sign:

1. **Erase everything**, the audit entry's IP included. It is the simplest rule to explain, and it leaves no proof that the mandate existed.
2. **Keep a minimal proof for a fixed period**, as retention for legal claims (GDPR Article 17(3)(e) is the usual basis in France; the US position needs the same review). The proof would hold the document version, `signedAt`, `revokedAt` and a hash of the IP, either in an archive table without a cascading foreign key or in `Mandat` itself with a nullable `profileId` and `onDelete: SetNull`. It is deleted when the period ends, and the audit entry's IP follows the same period.

The chosen rule then goes into the privacy policy and into `deleteMyAccount`.
