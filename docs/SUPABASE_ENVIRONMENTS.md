# Supabase environments

The production project is the only place real data lives. Its project ref, written `<prod-ref>` below, is kept in the team's private notes. Local machines, Vercel previews and tests point at a dev environment that holds invented data only.

## The dev environment: free project or Pro branch

| Option | Cost | Notes |
|---|---|---|
| A second free project, `agental-dev` (already created, Data API off) | $0 | Pauses after about 7 days without activity; restore it from the dashboard. |
| A branch of production on the Pro plan | $25 a month for Pro, plus about $10 a month for a persistent Micro branch | Created from the dashboard; the GitHub integration is optional. It starts without production's data. Pro also brings daily backups, which production should have before launch. |

The repository treats both the same way: Prisma applies the schema with `prisma migrate deploy`, and the data comes from `prisma/seed.ts`. The free project is enough today; a branch makes sense once production moves to Pro anyway.

## Set up dev

1. In the dev project (or branch), reset the database password under Project Settings, Database, and store it in the team password manager.
2. From the Connect dialog, copy the transaction pooler string (port 6543) for `DATABASE_URL` and the session pooler string (port 5432) for `DIRECT_URL`, in the format shown in `.env.example`.
3. Write the local `.env` by hand: `cp .env.example .env`, then the two dev URLs, a new `AUTH_SECRET` (`openssl rand -base64 32`), `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, and the `R2_*` variables either empty (files go to `.uploads/`) or set for `agental-media-dev`.
4. Make sure the file holds nothing from production: `grep -c <prod-ref> .env` must print `0`.
5. On a new branch, check in the Table Editor that the `public` schema is empty.
6. Apply the schema with `bun run db:deploy`. It runs `prisma migrate deploy` through `DIRECT_URL` (`prisma.config.ts`), applies pending migrations in order and resets nothing.
7. Add invented data with `bun run db:seed`. Its demo accounts share the published password `demo1234`, which is acceptable here and nowhere else.
8. Check with `bun run test` (the media-access test creates and deletes its own rows in this database) and `bun run dev`.

Production data stays in production: no `pg_dump` or restore into dev, no CSV export, no copied rows, even for a quick debug. For realistic volume, extend `prisma/seed.ts` with invented people.

## Vercel and the local `.env`

| Vercel environment | Database | Media | Other |
|---|---|---|---|
| Production | production `DATABASE_URL` and `DIRECT_URL` | `R2_BUCKET=agental-media`, with a token scoped to that bucket | production `AUTH_SECRET`, `AUTH_URL=https://www.agental.co` |
| Preview | dev `DATABASE_URL` and `DIRECT_URL` | `R2_BUCKET=agental-media-dev`, with its own token | its own `AUTH_SECRET`, `NEXT_PUBLIC_SITE_URL` set to the preview domain, and `AUTH_URL` left unset |
| Development | unused | | |

- The project's variables are marked Sensitive. Sensitive variables can target Production and Preview only and cannot be read back, so `vercel env pull` returns nothing usable, and local work uses the hand-written `.env` from the steps above.
- A variable change reaches new deployments only. A preview built before the switch, the showcase preview included, keeps the values it was built with until someone redeploys it, so redeploying it is a decision to make on purpose.
- R2 CORS lists exact origins, and preview URLs change with every deployment. Give previews one stable domain (for example `dev.agental.co`, assigned to the Preview environment) and allow only that domain and `http://localhost:3000` on `agental-media-dev`.
- Rotate the production R2 token if it is scoped to more than `agental-media`.

## Applying a migration to production

1. Apply it to dev first (`bun run db:deploy` with the dev `.env`) and run the checks in [DATA_SECURITY.md](DATA_SECURITY.md).
2. Merge the pull request.
3. In a terminal, hand the production URL to these two commands only, so it stays out of `.env` and out of the shell history. `read -rs` waits, without echoing, for you to paste the production session pooler URL and press Enter.

   ```sh
   read -rs PROD_DIRECT_URL
   DIRECT_URL="$PROD_DIRECT_URL" bunx prisma migrate status
   DIRECT_URL="$PROD_DIRECT_URL" bun run db:deploy
   unset PROD_DIRECT_URL
   ```

   `migrate status` only reads the migration history, and lists what `db:deploy` is about to apply. A variable set in the shell wins over `.env`, which `prisma.config.ts` loads without overriding, so these commands reach production while `.env` still points at dev.
4. Run the checks again, on production.

A migration can also be pasted into the SQL editor first, as `20261118000000_enable_rls` was. `migrate deploy` then runs it again and records it, which is safe only for idempotent migrations such as the two RLS ones and the email one below.

### Lowercasing stored emails

`20261120000000_normalize_user_emails` rewrites every `User.email` in lowercase and adds a unique index on `lower(email)`. When two accounts hold the same address in different letter cases, it stops before changing anything and `db:deploy` reports it as failed. The app keeps working meanwhile, since it matches emails in any letter case. To resume:

1. List the pairs with the dry run, which writes nothing: `DATABASE_URL="$PROD_DIRECT_URL" bun run db:lowercase-emails`.
2. Decide with the people concerned which account keeps the address, then change the other account's email in the SQL editor.
3. Mark the failed attempt as rolled back, then deploy again:

   ```sh
   DIRECT_URL="$PROD_DIRECT_URL" bunx prisma migrate resolve --rolled-back 20261120000000_normalize_user_emails
   DIRECT_URL="$PROD_DIRECT_URL" bun run db:deploy
   ```

To avoid the failed attempt, run the dry run of step 1 right after `read -rs PROD_DIRECT_URL`, before `db:deploy`.

## Commands that stay away from production

- `bun run db:migrate` is `prisma migrate dev`. It writes new migrations, replays the history on a shadow database and, when the database's history differs from the repository's (a migration applied by hand, or one that exists on another branch only), offers to reset the database, which drops every table. A single wrong answer at that prompt would erase production, so it runs against dev only, to author migrations.
- `prisma migrate reset` drops everything by design. `prisma db push` changes the schema outside the migration history, and its `--accept-data-loss` and `--force-reset` flags delete data.
- `bun run db:seed` creates demo accounts with a published password, an admin among them.
- `bun run test` runs `tests/api/media-access.test.ts`, which creates and deletes rows in whatever `DATABASE_URL` points at.
- `bun run db:studio` edits rows directly, with no audit entry. To read production data, use a written query in the SQL editor.

## Guards to add

Each guard looks for the production ref, read from an environment variable such as `PROD_DB_REF` so that it stays out of the repository, in the connection strings.

- `prisma/seed.ts`: refuse to run when `DATABASE_URL` or `DIRECT_URL` contains it. The existing guards (`ALLOW_DEMO_SEED`, `NODE_ENV`) pass in any local shell, since `bun run db:seed` sets the first one itself.
- `tests/api/media-access.test.ts`: skip when `DATABASE_URL` contains it.
- `db:migrate`: wrap it in a script that refuses on the same condition.
- The build: fail when `VERCEL_ENV` is `preview` and `DATABASE_URL` contains it.
- `tools/db/purge-demo-accounts.ts` is meant to run against production on purpose. Keep the dry run as the default, and require an explicit flag before it touches production.
