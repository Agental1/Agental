@AGENTS.md

# Agental: read this first

## Before doing anything

1. Read `docs/DECISIONS.md`: what the founders decided (products, prices, brand, stack, rules).
2. Then `docs/STATUS.md`, `docs/HANDOFF.md` and `docs/RELEASES.md`.
3. Before touching routing, i18n or server actions, read `README.md`: locale prefix on every
   URL, negotiation in `src/proxy.ts` (not `src/middleware.ts`), navigation imports from
   `@/i18n/navigation`, server actions return a translation key, never a sentence.

## Decisions are the founders'

Never change prices, plan names, commissions, allowances, positioning or brand rules
without an explicit instruction from the founders in the current conversation. When they do
change one, update `docs/DECISIONS.md` in the same commit, with the date.

Prices, commissions and search allowances live in `src/domain/pricing.ts` only. Copy uses
the `{price}`, `{commission}` and `{searches}` tokens (`src/lib/plan-price.ts`); never write a
figure in a message file.

## Rules for every session

1. Keep all data, including the founders' test accounts. Never wipe or reseed. Migrations
   are additive.
2. Never type or paste a password, key or secret. Prepare the page and tell the founders
   exactly what to copy and where.
3. Deploy only when the founders ask, through `/ship` and `/land-and-deploy`. Record every
   release in `docs/RELEASES.md` with its deployment ID and the rollback ID.
4. Keep `docs/STATUS.md` and `docs/HANDOFF.md` current at the end of each session.
5. This repository is public: never commit secrets, personal emails or confidential documents.
6. American English in English copy, no em dashes in any UI copy.
7. Supabase for everything (no Cloudflare R2, no AWS). On the Free plan (50 MB per file,
   1 GB of storage): if something needs a paid plan, say so instead of doing it.

## Tooling

- Package manager: bun (not pnpm or npm). Checks: `bun run typecheck`, `bun run lint`,
  `bun run i18n:check`, `npx vitest run --no-file-parallelism` (the local database takes one
  connection; parallel files drop it).
- Never run database tests or `bun run build` against the database in `.env`: point
  `DATABASE_URL`/`DIRECT_URL` at the local database (localhost) first.
- Branches: production deploys (`vercel deploy --prod` from this Mac) come from
  `frontend-redesign`; keep `main` fast-forwarded to it after each release. Work on a branch,
  open a pull request into `frontend-redesign`, squash-merge, deploy, tag, add the
  `docs/RELEASES.md` row.
- A running dev server writes into `.next`; if typecheck reports errors under `.next/dev/types`
  or pages answer 500 with a JSON parse error, stop the server and delete `.next`. Restart the dev
  server after `prisma generate`.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. Route only to skills in the session's available-skills list; answer directly for quick questions or small scoped edits.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- QA/testing site behavior → invoke /qa
- Code review/diff check → invoke /review
- Ship/deploy/PR → invoke /ship

Do not suggest or auto-invoke other gstack skills: they run when the user types them, or when a running skill hands off to them (`gstack-config set proactive all` routes every skill).
