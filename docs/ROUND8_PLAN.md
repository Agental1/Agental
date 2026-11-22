# Round 8 plan: Talent app, profile, pricing and notifications

Started 2026-11-22. Brief: the owner's `Agental_Cowork_Round8_Prompt.md` (Desktop), written from
Jérôme's notes. Rollback point: tag `pre-r8`, deployment `agental-leyymorx4` (see
`docs/ROLLBACK_R8.md`).

## How the round runs

- One branch per group off `frontend-redesign` (`round8-g1` ... `round8-g5`), one pull request,
  squash-merge, `vercel deploy --prod` from a clean checkout, tag `live-2026-11-22-r8-g<n>`, row in
  `docs/RELEASES.md`, push notification, next group.
- Checks before each deploy: `bun run typecheck`, `bun run lint`, `bun run i18n:check`, targeted
  vitest on the local database (port 51234), visual check of the changed pages at desktop and
  390 px on the local dev server.
- Package manager: the repo uses **bun**, so `bunx shadcn@latest add` replaces `pnpm dlx` (same CLI,
  `components.json` kept, never `init`). Brand tokens re-checked after every `add`.
- Migrations are Prisma migrations in `prisma/migrations`, applied by the production build. Each
  one is additive; data moves are read-time mappings or backfills into new columns only.
- No production database access from this Mac (round 7 note), so counts that need production
  data (accounts below 100%, cities and phones linked) are computed by the migrations themselves
  where possible, and otherwise reported as "not measured".

## Specialties tab today (2.1 inventory)

Stored in `Specialty` rows (`kind`, `level`, `tags`) and on `ArtistProfile`:

| Field | Storage | Round 8 |
|---|---|---|
| Kinds: Background (figuration), Silhouette, Supporting roles (seconds-roles), Commercials (publicite), Photo, Voice (voix), Kids (enfants), Creators (createurs), Performers (performeurs), Screen acting, Stage acting, Musical theatre, Improv, Movement, Stunt and combat | `Specialty.kind` | Work-type duplicates merge into Preferences: publicite -> project type Commercial, voix -> project type Voice, figuration and silhouette -> role type Background, seconds-roles -> role type Supporting. The rest move to Preferences under "Skills" (same rows). |
| Level (Beginner, Intermediate, Confirmed) | `Specialty.level` | Kept as stored; never shown in the editor (always Beginner from the form). |
| Tags | `Specialty.tags` | Kept, not shown (never was). |
| Minimum rate | `ArtistProfile.minRateCents` | Becomes the day rate (USD), shown only with paid work. |
| Mobility countries | `ArtistProfile.mobilityCountries` | Not in the editor; kept as stored. |

The merge happens when preferences are read (a flag marks it done on the next save), so nothing
is lost and no row is rewritten by a migration.

## Groups (cheapest first)

0. Rollback point: done (tag `pre-r8`, branch `backup/pre-r8`, schema backup, rollback doc).
1. Navigation and simple fields: shadcn sidebar with `collapsible="icon"` (Talent, Casting,
   admin share `AppShell`), account only at the bottom left, no Website item (old link redirects
   to `Subscription#limelight`), Current city, legal first and last name, Stage name optional,
   red asterisks, bio 5,000 with counter, gender, hair and eye dropdowns, Availability hidden,
   languages in Identity only, Casting Pro $95 (and Studio $295, the same decision).
2. Profile in four tabs, Physical tiles, autosave, one 100% rule, celebration, search dialog,
   media suggestion, media drag and drop, website link.
3. Location (GeoNames in Supabase), phone (libphonenumber-js, E.164), languages, accents,
   schools (only if a school field exists).
4. Pricing values, USC student promotion, Promotions panel, Limelight inside Subscription,
   dashboard website card.
5. Notification bell (table, announcements, triggers), contact preference with SMS consent;
   `/review` and `/qa` before deploy.

## Choices made without the owner

Listed here as they come, and copied into the final report.

- bun instead of pnpm (the repo's package manager).
- Casting Studio set to $295 with Pro $95: both differ from `docs/DECISIONS.md` the same way.
- Group 1: the red asterisks and the "Fields marked * are required" line ship with the new 100%
  rule in group 2, so the stars never mark a field the score does not count yet.
- Group 1: /browse needs the Aside app, which is not installed, so local pages were checked in the
  desktop app's preview pane on localhost (no production session involved).
- Group 1: the Website page redirect needed Limelight on the Subscription page now, so its
  existing section (offers, sites, request form) moved there in group 1; group 4 reshapes it.
- Group 2: "paid or unpaid" keeps its two existing answers ("Paid work only", "Paid or unpaid");
  the day rate is asked, and required, only with "Paid work only".
- Group 2: a work type is either a project type or a role type (both lists stay; project types
  carry the asterisk).
- Group 2: the drag bug (2.8). Root cause: Profile > Media had no drag code for tiles at all.
  The only drop handler sat on the empty placeholder of an empty category; once a category had
  one item, a file dropped on it hit the browser default and opened the file in the tab, leaving
  the app, and dragging an existing tile did nothing. Fixed with dnd-kit handles plus a drop
  handler on every category.
- Group 2: the count of accounts that drop below 100% comes from a read-only aggregate query
  printed in the production build log (`tools/db/round8-report.mjs`), since this Mac has no
  production database access.
- Group 2: Physical tiles are 5 per row from 1280 px, 3 from 768 px, 2 below (at 1024 px five
  tiles were too narrow for the height selects).
- Group 2 result (production build log, 2026-11-22): 18 profiles; 1 was at 100% before round 8
  and drops below it, missing gender and the playable age range (both new). No other field
  caused a drop for it. 11 profiles have a free-text city, 6 a phone number.
- Group 3: the geodata is loaded by a migration (multi-row INSERTs, 3.8 MB SQL) so production,
  previews and local databases get the same rows; GeoNames `cities5000` (70,101 cities) fits the
  Free plan easily. The trigram index is created where `pg_trgm` exists and skipped quietly
  elsewhere; the city search itself is a prefix match.
- Group 3: no school field exists on the profile, so schools (3.5) were not added.
- Group 3 result (production build log): 5 of 11 free-text cities linked automatically, 6 left as typed (ambiguous or unknown); 5 of 6 phone numbers converted to E.164, 1 left.
- Group 4: the offer and its quoted price are written at the start of the lead's "what they need"
  text (the lead table has no price column; no migration for it). Prices come from the
  configuration, never from the form.
- Group 4: the "College student? Verify your school email" card stays on Subscription (the
  existing verification flow); only the plan-card line was replaced by the Promotions panel.
- Group 4: `tests/api/limelight-leads.test.ts` "two drains at the same moment" passes alone and
  before the change, and fails only in the full file run on the shared local database (timing).
