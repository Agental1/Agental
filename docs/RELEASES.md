# Releases and how to go back

Every version that goes live on agental.co gets a git tag and a line here, so the site can be put back one step (or several) at any time.

| Date | Tag | Commit | Vercel deployment | What changed |
|---|---|---|---|---|
| 2026-11-18 | `live-2026-11-18-limelight` | `000f695` | `agental-49debvfve-agentalco.vercel.app` | Limelight page, Green room look |
| 2026-11-18 | `live-2026-11-18-redesign` | `1e114eb` | `agental-8ey3sbi7v-agentalco.vercel.app` | Blue themes, A monogram, new public pages, app shell |
| 2026-11-19 | `live-2026-11-19-round2` | `b506458` | `agental-rmh721urr-agentalco.vercel.app` | Audience pages with account card, home sections, Limelight templates and Try it, cookie consent, tour, uploads, Your website. Applied four database migrations. |
| 2026-11-19 | `live-2026-11-19-release1` | `18c3287` | `agental-2bj1oiw9g-agentalco.vercel.app` | Beta notices (footer, About, Limelight), Settings > Connected accounts, forgot password, reset and email confirmation pages, release log, handoff file. No migration. |
| 2026-11-19 | `live-2026-11-19-release2` | `bff6edb` | `agental-exmsrxj64-agentalco.vercel.app` | Beta wording, mandate step replaced by a beta notice, setup resume, Limelight flow and Maya Okafor sample, Agental Find preview, human Messages and team inbox, Limelight requests admin, Specialties and Preferences, Your website approve and publish. Applied three additive migrations. |
| 2026-11-19 | `live-2026-11-19-google` | `bff6edb` | `agental-o7qjzmknb-agentalco.vercel.app` | Redeploy of release 2 with `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`: Google button on sign-in pages. No code change, no migration. |
| 2026-11-19 | `live-2026-11-19-r3-g1` | `30b45cf` | `agental-aczt7s6b1-agentalco.vercel.app` | Round 3 group 1: Free renamed Basic (display only), pricing $0/$19/$250/$500, commission 10/10/7.5/6%, AI search allowances in `src/domain/pricing.ts`, plan details on every card, em dashes removed from copy, Applications subtitle, one profile card on the dashboard. No migration. Previous: `agental-o7qjzmknb-agentalco.vercel.app`. |
| 2026-11-19 | `live-2026-11-19-r3-g2` | `0432f98` | `agental-h3rvlrm8b-agentalco.vercel.app` | Round 3 group 2: IMDb and portfolio links on Profile (counted in completeness), Your website shows the two Limelight offers and "Send my request" (prefilled form, saved to the Limelight requests), first sign-in suggestion (complete profile, then launch research). Migration `20261123000000_profile_links` (two nullable columns, additive). Previous: `agental-aczt7s6b1-agentalco.vercel.app`. |
| 2026-11-19 | `live-2026-11-19-r3-g3` | `1ac001e` | `agental-ja5xp4vui-agentalco.vercel.app` | Round 3 group 3: "Start finding roles" green button with AI searches left, quota checked and row written in one transaction (Basic 4, Pro 50 a month), radar animation (reduced motion respected), "Search in progress" on Applications, admin list at /admin/recherches. Migration `20261124000000_role_search_requests` (new table, RLS on). No workflow called. Previous: `agental-h3rvlrm8b-agentalco.vercel.app`. |

Google sign-in: the button is live and reaches Google's account screen. The Google app is still in Testing with no test users, so nobody can finish signing in yet; publishing needs a privacy-policy page (see `docs/HANDOFF.md`).

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
