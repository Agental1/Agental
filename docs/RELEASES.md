# Releases and how to go back

Every version that goes live on agental.co gets a git tag and a line here, so the site can be put back one step (or several) at any time.

| Date | Tag | Commit | Vercel deployment | What changed |
|---|---|---|---|---|
| 2026-11-18 | `live-2026-11-18-limelight` | `000f695` | `agental-49debvfve-agentalco.vercel.app` | Limelight page, Green room look |
| 2026-11-18 | `live-2026-11-18-redesign` | `1e114eb` | `agental-8ey3sbi7v-agentalco.vercel.app` | Blue themes, A monogram, new public pages, app shell |
| 2026-11-19 | `live-2026-11-19-round2` | `b506458` | `agental-rmh721urr-agentalco.vercel.app` | Audience pages with account card, home sections, Limelight templates and Try it, cookie consent, tour, uploads, Your website. Applied four database migrations. |
| 2026-11-19 | `live-2026-11-19-release1` | `18c3287` | `agental-2bj1oiw9g-agentalco.vercel.app` | Beta notices (footer, About, Limelight), Settings > Connected accounts, forgot password, reset and email confirmation pages, release log, handoff file. No migration. |

## Going back one step

The fastest way: make the previous deployment the live one again. Nothing is rebuilt.

```bash
vercel promote agental-8ey3sbi7v-agentalco.vercel.app
```

Use the deployment name from the row you want. `vercel rollback` does the same for the deployment just before the current one.

To continue working from an older version of the code:

```bash
git checkout -b back-to-redesign live-2026-11-18-redesign
```

## What a rollback does not undo

- **The database.** Migrations are additive (new tables and columns, tighter privileges). Older code runs on the newer database; no data is removed by going back.
- **Settings in Vercel, Google or Cloudflare.** They stay as they are.

## Rule

Before each production deploy: all checks pass, the tree is committed and pushed. After it: tag the commit `live-YYYY-MM-DD-name`, push the tag, add a row above.

The showcase preview `agental-m1vwewu0h-agentalco.vercel.app` is frozen and never changed or deleted.
