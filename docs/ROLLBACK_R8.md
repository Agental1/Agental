# Going back to before round 8

Saved on 2026-11-22, before any round 8 change.

| What | Value |
|---|---|
| Live deployment before round 8 | `agental-leyymorx4-agentalco.vercel.app` (id `dpl_2Q7JykYjHdkwfCR7dPnLP5a9WCfi`), v0.5.8.0 |
| Commit it was built from | `c33b179` (tag `pre-r8`, also `live-2026-11-22-r7b-admin`) |
| Backup branch | `backup/pre-r8` (at `b97d122`: same code as `c33b179` plus three docs commits) |
| Schema backup (no data) | `docs/backups/pre-r8-schema.sql` |

## 1. Put the pre-r8 site back in production (one step, nothing rebuilt)

From this Mac, in the `Agental` folder:

```bash
vercel promote agental-leyymorx4-agentalco.vercel.app
```

Or in the dashboard: vercel.com > agentalco > agental > Deployments > find
`agental-leyymorx4` (created Nov 22, 1:12 AM, v0.5.8.0) > the three dots on the right >
"Promote to Production" > confirm. www.agental.co serves it within a minute.

`vercel rollback` only goes back one deployment, so after several round 8 groups use the
`promote` command above. To go back to the end of one round 8 group instead, use the
deployment named in that group's row of `docs/RELEASES.md`.

## 2. Bring the code back (no force-push)

On `frontend-redesign`, revert the round 8 commits so history stays intact:

```bash
git checkout frontend-redesign && git pull
git revert --no-edit pre-r8..HEAD
git push origin frontend-redesign
```

If a revert conflicts, `git revert --abort`, then revert group by group (each group is one
squash commit; their hashes are in `docs/RELEASES.md`), newest first. To look at the old code
without touching the branch: `git checkout -b look-pre-r8 pre-r8`.

## 3. The database

Round 8 migrations are additive only: new tables, new nullable or defaulted columns, indexes,
triggers that insert into new tables, and backfills that write only into new columns. Nothing
is dropped, renamed or deleted. The pre-r8 code never reads the new tables or columns, so it
keeps working on the round 8 database. Going back does not undo the migrations and does not
need to.

| Migration | What it adds | Safe for pre-r8 code? |
|---|---|---|
| (filled in as each group lands) | | |
