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
| `20261204000000_round8_identity` (group 1) | Four nullable text columns on `ArtistProfile`: `legalFirstName`, `legalLastName`, `gender`, `genderOther`. No backfill; the old `legalName` column is untouched. | Yes: the pre-r8 code never selects these columns, and Prisma ignores columns it does not know. |
| `20261205000000_round8_profile_complete` (group 2) | One nullable timestamp, `ArtistProfile.profileCompletedAt`. No backfill. | Yes: never read by the pre-r8 code. Preference keys added in group 2 (`playableAgeMin`, `playableAgeMax`, `merged`) live inside the existing JSON text column; the pre-r8 reader ignores unknown keys and keeps them on save. |
| `20261206000000_round8_geo` (group 3) | Three new tables `GeoCountry`, `GeoAdmin1`, `GeoCity` filled with GeoNames data, a prefix index and (where available) a trigram index, RLS on. | Yes: new tables, never read by the pre-r8 code. |
| `20261206010000_round8_location_phone` (group 3) | Four nullable columns on `ArtistProfile` (`countryCode`, `admin1Code`, `cityGeonameId`, `phoneE164`), filled for unambiguous cities and clean US numbers. `city` and `phone` are untouched. | Yes: the pre-r8 code reads `city` and `phone` only. |
| `20261207000000_round8_website_card` (group 4) | One nullable timestamp, `ArtistProfile.websiteCardDismissedAt`. | Yes: never read by the pre-r8 code. Note: going back to pre-r8 code also brings back the old Limelight prices ($49/year, $199), which live in code. |
| (later groups) | | |
