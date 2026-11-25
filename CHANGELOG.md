# Changelog

Toutes les évolutions notables de ce projet. Format inspiré de
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [0.6.32.0] - 2026-11-24

### Added (round 11, group 4: languages)

- **Four new languages:** Italian (`/it`), Portuguese (`/pt`, Brazilian, `pt-BR`), Japanese (`/ja`) and Korean (`/ko`), beside English, French, Spanish and Chinese. No Arabic yet. Every message file was generated from English in one pass per language, every key, ICU placeholder, plural form (Japanese and Korean use `other` only) and rich tag kept; brand and plan names stay in English.
- **Settings > Language:** a search field at the top and the eight languages in alphabetical order of their English name, each in its own name with the English one next to it ("Italiano (Italian)"). The choice saves on the account and wins at every sign-in. The site's language switcher lists the same eight in the same order.
- **First visit:** the language comes from the saved choice (cookie), then the browser or phone language, then the country of the IP address (`x-vercel-ip-country`: Italy, Brazil and Portugal, Japan, Korea, French-, Spanish- and Chinese-speaking countries), then English (`src/domain/locale-negotiation.ts`, tested).
- **Emails** use the person's saved language in the four new languages too (account emails, automatic emails, the assistant's rule-based answers).
- **Typesetting:** Japanese and Korean get the same display rules as Chinese (no negative tracking, taller line height, no mid-phrase breaks in headings) and their own font stacks (Hiragino, Noto Sans JP, Yu Gothic, Meiryo; Apple SD Gothic Neo, Noto Sans KR, Malgun Gothic), so kanji are drawn in their Japanese forms.
- **Checks:** `pnpm i18n:check` covers eight locales; `tests/i18n/locale-parity.test.ts` checks that every locale has every English key with the same placeholders and tags, and no em dash. Translation helpers in `tools/i18n/` (`flatten.mts`, `verify-chunks.mts`).

## [0.6.31.0] - 2026-11-24

### Changed (round 11, group 3: consent, Privacy Policy, account deletion)

- **Sign-up:** a required box "I agree to the Privacy Policy" (and "the Terms of Service" once they are published with `TERMS_PAGE_ENABLED`), never pre-ticked; "Create my account" stays disabled until it is ticked, and the server refuses a sign-up without it. The account records the date and the version (`privacyAcceptedAt`, `privacyVersion`, `termsAcceptedAt`, `termsVersion`; versions in `src/domain/legal-versions.ts`, Privacy Policy `2026-11-24`). Migration `20261227000000_round11_legal_acceptance` (four nullable columns).
- **Older accounts and Google sign-ups:** accept the current Privacy Policy once, on a screen shown before the app opens at their next sign-in (audited `legal.accepted`). Accounts with no cookie choice recorded see the cookie banner again; the answer goes on the account.
- **Privacy Policy:** "Account security and abuse" now says in one paragraph that we may limit, suspend or delete an account that is fake, abusive, used for spam, breaks the Terms, or whose email was never verified. Linked from the cookie banner ("How we protect accounts") and the sign-up box. Last updated November 24, 2026, in the four languages.
- **Admin:** "Privacy Policy accepted: date, version" next to the cookie choice in Admin > Accounts, on each account page and in Admin > Cookies (with a count of who has not accepted), filters (accepted or not, version) and CSV columns `privacy_accepted_at`, `privacy_version`. Lawyer questions in `docs/legal/ACCOUNT_MONITORING.md`.

## [0.6.30.0] - 2026-11-23

### Changed (round 11, group 1: the sign-up code and verification before the dashboard)

- **The code screen:** "Enter the 6-digit code we sent to <email>." At the bottom a blue "Send a new code" button, available 60 seconds after each code (the countdown on the button), and "Wrong email? Change it": an unverified email and password account types the right address, the old codes stop working and a new code goes there (3 changes an hour, the daily cap of 5 codes, audited without the addresses). Email only. The same form in the banner's dialog, which now keeps the focus inside and gives it back to "Send me a code" on close.
- **Verification before the dashboard, behind a switch that stays off:** Admin > Controls, "Email verification required before the dashboard" (audited, a confirmation box to turn it on). On: an unverified email and password account goes to the code screen from every app page and onboarding, after sign-up and at every sign-in; Google and Apple accounts pass; nobody is held while no email can be sent. `EMAIL_VERIFICATION_REQUIRED_SINCE` is no longer read: it switched a gate on by itself as soon as a Resend key existed.
- **Round 10 low items:** the admin shows and filters dates in one zone (Los Angeles, printed next to each date); "Can search" says "Not a performer" for Casting and Staff accounts; the CSV `can_search` column is in words; account timelines show what happened ("Email verified") instead of audit keys; the dashboard says when staff paused AI searches before any click. The session follows the account's address after a change.

## [0.6.29.0] - 2026-11-23

### Changed (round 10, group 4: a clearer admin)

- **One account model, explained on the page:** a type (Performer, Casting or Staff), Test as a separate badge, Deleted counted only in Deleted. Six counts (Accounts, Performers, Casting, Staff, Test, Deleted), each with an "i" that says what it counts, the same on Admin home and Admin > Accounts. Admins and older STAFF accounts, and the founder's own Test account (kept Test), became Staff.
- **One readable line per account:** name, email, type, Test badge, email verified with the date, profile %, "Can search: Yes" or "No: <reason>" (the green button's reasons), searches used this month, sign-up date, last sign-in, cookie choice. The review statuses and "Agents enabled" left the screens (kept in the database and the CSV). The change menu: Test on/off, Staff on/off, Block AI searches, Spam.
- **Admin > Cookies:** each account's choice with its date and policy version, filters and CSV; visitors without an account as weekly totals by choice only, recorded from now on.

Migration `20261226000000_round10_account_model` (a column, a table, RLS on; data: Staff types, audited).

## [0.6.28.0] - 2026-11-23

### Changed (round 10, group 3: the green button)

- **One clear reason when a search cannot start**, under the button and in its dialog, with the action that fixes it: blocked by staff (Open Messages), email not verified (Send me a code, the 6-digit form in the dialog), profile below 100% (the missing fields named, a link to the first one), searches not open for this account yet, no searches left (the date of the next one, See plans). A saved search that waits says when it starts (slots busy) or that searches are paused (pause switch on, or the search service not connected).
- **Admin > Controls: "AI searches are open to"** Test accounts only (default) or All verified performers at 100%, with the plan allowances, the per-search cost ceiling and the provider budgets shown, and a confirmation box to open it. Audited. The server gate, the n8n claim and the admin list all read it.
- **Everyone's allowance reset again** (history kept, waiting searches canceled). Migration `20261225000000_round10_search_reset` (data only).
- `tools/db/local-search-states.mts` puts a local account in each situation for QA.

## [0.6.27.0] - 2026-11-23

### Added (round 10, group 2: sign-up code and questions)

- **A 6-digit code at sign-up.** After "Create account" with a password, the next screen says "Enter the 6-digit code we sent to <email>": six boxes (a pasted code fills them), checked at the sixth digit, a new code after 60 seconds, 10 minutes, 5 attempts, at most 5 code emails a day; only a keyed hash is stored. Google sign-ups skip it. Sent from `EMAIL_FROM` through Resend; without Resend in production the screen is skipped.
- **"Verify your email to start finding roles"** at the top of the app for password accounts that never verified, with "Send me a code" and the same form in a dialog (shown while a code can be sent).
- **The sign-up questions are the profile's own fields**, saved into the profile: legal first and last name and stage name, then date of birth, gender and phone (no city, no specialties). The agreement screen and the 3-step welcome stay. New accounts (Google too) that have not answered them go back to them at sign-in.

Migration `20261224000000_round10_email_code` (new table, RLS on).

## [0.6.26.0] - 2026-11-22

### Changed (round 10, group 1: profile fixes)

- **Accents**: about 300, grouped by region (more US, UK, Latin American, African, Asian and Middle Eastern accents). "None" first (exclusive), "Other: write your own" last: what is typed becomes a chip, several allowed.
- **Phone**: the caret never jumps, Backspace removes one digit even over a parenthesis or a space, a pasted number in any format works ("+1 213 555 0123", "213-555-0123", "(213) 5550123"), a "+" number picks its country, the selector reformats; saved as E.164 only when valid.
- **Build is required** for 100% (red asterisk). One photo of yourself is the only required media; the other categories say "Optional, highly recommended".
- **Ages you can play** start at 10.
- **Maturity rating** replaces "Content boundaries": G, PG, PG-13, R, NC-17, with "No nudity" as an optional limit; an earlier "open to nudity" reads as R.
- **The account at the bottom left** of the sidebar opens the same menu as the avatar at the top right (picture, email, Profile, Settings, Sign out); folded, the avatar alone opens it.
- **What is missing, in red**: a red dot and a count on each tab ("Physical · 1"), a red border and "Required" on each missing field, the missing fields as links in the completeness card; "Finish" is on every tab below 100% and walks the missing fields one by one.
- The `@demo.agental.co` account loses the admin role (W14), audited. Migration `20261223000000_round10_demo_not_admin` (data only).
- Build log: a read-only round 10 report replaces the round 9 one.

## [0.6.25.0] - 2026-11-22

### Added (round 9, group 9)

- **Pause everything** in Admin > Controls: stops at once the AI searches (they wait in the queue), the assistant's and the scorers' model calls (rules instead), automatic emails and texts (including the SMS opt-in text and the Limelight confirmation, which wait), and drafted replies. Audited with the switch in one transaction; a banner on every admin page while paused; an unreadable or corrupt setting counts as paused.
- **Admin > AI accounts**: the last 30 days of searches, assistant replies, emails and texts, and the AI cost per provider against each monthly budget (this month's share). Read-only. When a provider's admin key is missing, the cost the app recorded keeps the 80% budget alert working; a casting workflow failing 3 times in 24 hours alerts once a day.
- **`docs/GO_LIVE.md`**: the checklist before switching production to live, and the founder's exact steps.

## [0.6.24.0] - 2026-11-22

### Added (round 9, group 8), off behind a flag

- **The "roles found" text**, prepared and off: only with `SMS_ENABLED=true` and the Twilio settings (after US carrier registration). For performers who chose Text or Both, consented, have a US number and did not text STOP; at most one a day, in the US daytime, with the same staff approval and test-mode gates as the emails. An opt-in confirmation text on first consent.
- **STOP, START and HELP** on `/api/sms/inbound`, with Twilio's signature checked; the opt-out is recorded. A new phone number needs a new consent. Texts are logged without the number or the message. Admin > Controls shows the state; docs/HANDOFF.md lists what is missing.

Migration `20261222000000_round9_sms` (columns and a log table, RLS on).

## [0.6.23.0] - 2026-11-22

### Added (round 9, group 7)

- **Replies to the emails we receive need a staff approval.** "Agental Beta V2 - Direct Replies" now only reads Gmail and drafts; it posts each draft with the original email to the app (`/api/n8n/inbox/draft`) and sends nothing. Admin > Replies to approve shows the original and the draft with Send, Edit then send, and Discard.
- Only that click sends: through Resend, to the original sender, in the original thread (Re:, In-Reply-To, References), Reply-To and a hidden copy to contact@agental.co, with an idempotency key so a timeout never sends twice. A draft for an email staff already handled is refused; every decision and failed send is audited; texts, addresses and subjects are cleared after 90 days.
- The app refuses a workflow receipt saying it "sent" a reply. The admin hub counts the replies waiting.

Migration `20261221000000_round9_reply_drafts` (columns).

## [0.6.22.0] - 2026-11-22

### Added (round 9, group 6)

- **Automatic emails in the brand** (Talent theme, Helvetica, the A monogram): roles found (a digest, at most one a day, when the contact preference is Email or Both), application updates (self-tape requested, invited, contracted, and now declined), a new reply in Messages unread after an hour, and the welcome once the email is verified. Copy in English, French, Spanish and Chinese.
- **Two gates**: staff approve each category in the new Admin > Controls (none approved; approving one never sends its backlog), and in test mode only Test accounts receive them. Never a deleted, spam or revoked account; nothing older than 26 hours (a week for the welcome); each run stops claiming after 40 seconds.
- **Unsubscribe** per category: a signed one-click link (List-Unsubscribe header, page `/desabonnement`) and Settings > Notifications, which gains "Roles found". Account emails stay on.
- Hourly run through GitHub Actions (`CRON_SECRET` as a GitHub secret), daily through the Vercel cron.

Migrations `20261220000000_round9_auto_emails` (columns, the declined update) and `20261220000100_round9_app_settings` (new table, RLS on).

## [0.6.21.0] - 2026-11-22

### Added (round 9, group 5)

- **Samantha, Adrian or the performer's own name: the AI agent in Messages.** Speaks as the agent the performer set up, with the help they chose; answers about their profile, searches (used, left, running), roles found, applications and plan; points to the right page; hands off to the team for a human, contracts, money, legal matters or anything unsure. Never promises a role, never gives legal or financial advice, never sends, applies or changes the profile. Listing text and the performer's words are data, never instructions.
- Claude Haiku 5.5, on as soon as `ANTHROPIC_API_KEY` is set (`ASSISTANT_MODEL_ENABLED=false` turns it off); in test mode for Test accounts only. Caps: 10 / 30 / 60 / 100 model replies a day by plan, 900 characters a reply, $25 a month; past a cap, the rule-based answer with a short note. Each reply's cost is recorded once.
- Agent replies carry an "AI agent" tag for performers and staff. `docs/ASSISTANT.md` lists the prompt-injection tests (structural tests pass; live tests wait for the key).

## [0.6.20.0] - 2026-11-22

### Added (round 9, group 4)

- **Casting searches through n8n, app side complete.** The claim hands n8n the minimum profile and the per-search cost ceiling ($0.50, `SEARCH_COST_CEILING_USD`); the completion stores ranked roles with the full description for "Get more details" (dates, pay, union, what to send), the drafts for the team, and the tokens and cost per provider (new `AiUsage` table), once even on retry and also for a late completion.
- Over the ceiling: recorded, the admins alerted once; a search the workflow stops is failed and gives its place back, and a performer with two such stops in a day gets no new automatic search that day.
- Automatic searches for paid plans: Pro 10, Premium 50, Ultimate 100 per 30 days (proposal, TODO(founders)).
- Performers see a failed search for a week under "Search finished"; Admin > Applications and AI jobs shows the cost of each search and the last 30 days per provider.
- n8n "Agental Beta V2 - Direct Replies" (inactive): the ranking node sends the role details and the run's usage.

Migration `20261219000000_round9_ai_usage` (one new table, RLS on).

## [0.6.19.0] - 2026-11-22

### Added (round 9, group 2, part 1)

- **`docs/EMAILS.md`**: every email the site and the admin send, with trigger, sender, template, status and the inbox or spam result once tested.
- **Limelight confirmation email** to the person who asks for a portfolio site ("We received your Limelight request", with the reference). Claimed before sending, retried at most 6 times 6 hours apart, at most 100 a day, never for requests made before this release. The team alert and the confirmation are also retried by the daily cron.
- The four round-1 demo accounts (@demo.agental.co) are Test accounts (audit entries).
- Build report `tools/db/round9-report.mjs` (read-only counts) replaces the round 8d one.

Migrations `20261218000000_round9_demo_accounts_test` (data, audited) and `20261218000100_round9_limelight_confirmation` (three columns).

## [0.6.18.0] - 2026-11-22

### Changed (round 9, group 1)

- **Admin > Accounts, simpler cleanup.** Filters at the top (group, status, email verified, sign-up method, created before, payments, last sign-in or visit, plan, agents, audience), sortable columns, a checkbox per row with select all, and two buttons at the bottom: "Send warning email" ("Confirm your email within 7 days to keep your Agental account", recorded on the account) and "Delete" with one confirmation dialog.
- **Deleted, restorable for 30 days.** A deleted account is disabled at once (no sign-in, sessions ended, agents off, no email, hidden from every admin list) and listed in Admin > Deleted with Restore; after 30 days it is purged with its files (daily cron, and when Deleted is opened). Staff, test, admin and paying accounts can never be deleted. Every deletion, restore and purge is in the audit log.
- **Every count opens its list**: Staff shows the staff accounts with names and emails; Performers, Casting, Test, Spam and To review open exactly what they count.
- **Projects**: a list and a page per project (owner, dates, role, applications and their statuses).
- **Privacy Policy**: "Account security and abuse" and "Cookies" sections, retention of the email log; the cookie banner's "Read more" opens the cookies section. Notes for counsel in `docs/legal/ACCOUNT_MONITORING.md`, matching clause in the Terms draft.

Migration `20261217000000_round9_account_removal` (four nullable columns on User, one index).

## [0.6.17.0] - 2026-11-22

### Added (round 8d, group 4)

- **AI accounts card on the admin dashboard** for OpenAI, Perplexity and Anthropic (Claude): spend this month, read through each provider's cost report (`OPENAI_ADMIN_KEY`, `ANTHROPIC_ADMIN_KEY` in Vercel; "Not connected" without one), and what is left from the balance typed after each top-up. Perplexity has no spend or balance API: manual entry. Alerts (balance under a threshold, default $20, or 80% of a monthly budget) go once to every admin's bell and to contact@agental.co (logged until Resend is set up), on dashboard load and once a day by cron at 14:00 UTC (needs `CRON_SECRET`; the Vercel Hobby plan allows daily crons only).
- Agental never adds money, buys credit or changes billing at a provider: the code only sends GET requests to the cost reports (tested), and holds no payment method.

Migration `20261216000000_round8d_ai_accounts` (one new table, RLS on).

## [0.6.16.0] - 2026-11-22

### Security (round 8d, group 3)

- **Two-factor authentication for the admin role** (TOTP, any authenticator app): enroll by QR code on `/securite-admin`, then a code every 12 hours. Without it an admin is treated as a non-admin by every page, action and API. Secret encrypted at rest, each code works once, 5 codes per 15 minutes, every attempt audited. Required in production; `ADMIN_MFA_REQUIRED=false` turns it off.
- **Sign-in limit inside the credentials check**, so a direct POST to the auth endpoint is limited like the form.
- **Admin pages Minors and Style guide** check the admin role themselves.
- **Media links last 10 minutes** (were an hour).
- Tests: TOTP against the RFC 6238 vectors, admin second factor end to end, and modified requests that try to change a price, promotion, plan or quota.

Migration `20261215000000_round8d_admin_totp` (one new table, RLS on). New dependency `qrcode` (QR code for enrollment).

## [0.6.15.0] - 2026-11-22

### Changed (round 8d, group 2)

- **Parallel search slots per plan.** Basic 1, Pro 2, Premium 5, Ultimate 10 searches at the same time; each slot starts at most one search every 6 hours, so every plan can use its whole allowance in 30 days. Slots and the gap are plan configuration (`searchSlots`, `searchSpacingHours` in `B2C_PLANS`). The n8n claim runs at most the plan's slots per performer. Applications shows each queued search's expected start and "N of M running"; the dashboard Status shows "N of M running" and the next expected start.
- **Honest queue.** After the green button: "Your search is queued. Results will appear in Applications." Applications says "Your search is queued. Results will appear here." No result is shown until the search engine is connected (round 9).
- **Fresh start for every account.** `User.searchQuotaResetAt` (new) is set for every account; searches from before it do not count, the period start is cleared, and searches still waiting in the queue are marked canceled. No row is deleted. The reset is in the audit log with the counts.
- **The founder's account is a Test account**, so it can run searches while production is in test mode (matched by a hash of its email in the migration; audited with the previous status).
- Build report `tools/db/round8d-report.mjs` replaces the round 8c one (read-only, masked).

Migration `20261214000000_round8d_search_reset` (one new column, data updates, nothing deleted).

## [0.6.14.0] - 2026-11-22

### Changed (round 8d, group 1)

- **Height and weight show both units.** The Height tile reads "5 ft 10 in · 178 cm" and Weight "161 lb · 73 kg", the other unit in grey, also under the inputs while typing. The toggle converts the value; the database keeps centimeters and kilograms (every stored value from 91 to 241 cm and 20 to 300 kg round-trips, tested).
- **The agent's name everywhere.** When the performer named their agent ("Sam"), Messages shows it as the author of its replies, in the conversation header and as the avatar initial, and the bell says "Sam replied". "Agental assistant" only when no name is saved; the admin inbox uses the same name.
- **Several conversations in Messages.** "New conversation", a list of past conversations (title from the first message, date), and a menu on each to delete it, with a confirmation. A deleted conversation leaves the performer's Messages at once; the rows stay for the team (the admin inbox marks it "Deleted by the performer") and the Privacy Policy says so. The thread scrolls in its own box with a visible scrollbar on the right, opens on the newest message, and shows "Jump to latest" once scrolled up.

Migration `20261213000000_round8d_conversations` (additive): `Thread.hiddenForUserAt`; the one-thread-per-person unique index becomes a plain index. Code from before still reads one of the person's threads.

## [0.6.13.0] - 2026-11-22

### Changed (round 8c, group 5)

- **Account cleanup deletes only the accounts you tick.** Each eligible account has a checkbox, none ticked by default (a reload or an error never selects anything). Type `DELETE` and the number ticked. Only accounts still eligible can be deleted; anything else refuses the whole run. The run's audit entry records how many were eligible, ticked and kept.

No migration.

## [0.6.12.0] - 2026-11-22

### Added (round 8c, group 6)

- **Terms of Service, as a draft**: `docs/legal/TERMS_DRAFT.md`, written from `docs/DECISIONS.md`, with every point counsel must confirm marked `LAWYER:`. The page `/talents/conditions` exists but answers 404 unless `TERMS_PAGE_ENABLED=true`; it is linked from nowhere, kept out of the sitemap and noindex. Its text comes from the draft without the LAWYER notes.

No migration.

## [0.6.11.0] - 2026-11-22

### Added (round 8c, group 4)

- **Live bell**: a new notification reaches the bell at once through Supabase Realtime Broadcast (a private topic per person, opened by a one-hour token the app signs; no notification content travels over Realtime). Off until `SUPABASE_JWT_SECRET` and the publishable key are set; the 60-second refresh stays as the fallback.
- **Daily database backup**, free: a Vercel cron at 09:30 UTC copies every app table to the private Storage bucket `backups` (14 days kept), with a restore script that never overwrites (`docs/BACKUPS.md`). Needs `CRON_SECRET`.
- **Rate limit on search launches**: 20 presses of "Start finding roles" an hour per person.
- `docs/SECURITY.md`: RLS audit of the round 8 and 8b tables (all closed on production), rate limits, Free plan usage and when Pro is needed.

Migration `20261212000000_round8c_realtime_bell` (one trigger function, one trigger, one policy on `realtime.messages`; nothing granted on app tables).

## [0.6.10.0] - 2026-11-22

### Changed (round 8c, group 1)

- **pnpm replaces bun**: `bun.lock` removed, `pnpm-lock.yaml` added with the same direct dependency versions, `packageManager` pins pnpm 10.34.9, so Vercel installs with pnpm. Scripts that ran TypeScript with bun use `tsx`; the two scripts with top-level await are `.mts`.
- **Flaky test**: the Limelight "two drains at the same moment" case against the real database is skipped on a one-connection local database (it failed at random there); the race itself stays covered by the unit test with a fake outbox.
- **Pick your city, fix your number**: a profile whose city or phone round 8 could not link shows a short prompt at the top of the profile, with a link that opens the field with the cursor in it.
- **Deep links put the cursor in the field** even when the page opened in a background tab (a short timeout instead of an animation frame), and land on the City picker (not Country) and the phone number input.
- A one-off read-only report in the production build log lists the profiles that need the prompt and the database and Storage sizes (removed after round 8c).

No migration.

## [0.6.9.0] - 2026-11-22

### Changed (round 8c, group A)

- **Preferences reads as a numbered list**: each question has its number, 1 to 6 in the left column, 7 to 10 in the right one (ages, skills, how we tell you about a role, content boundaries). On a phone the single column reads 1 to 10.
- **Build takes several choices** (for example Athletic and Muscular), still with "Add your own". The choices show as small chips in the middle of the Build tile, each with a remove button. Saved in the same column, joined by commas; an earlier single value reads as one choice.
- **Every Physical tile shows its value in the middle**: height, weight (in the unit shown), hair color and length, eyes, tattoos, piercings, clothing sizes and shoe size.
- **Applications opens on three buttons**: "Search in queue", "Search in progress" and "Search finished", each with its count. The button pressed shows its list below (start times for the queue, start time for running searches, roles found for finished ones). Each role found has "Get more details", which opens the full description of what is asked, then the green Accept and red Decline. The dashboard Status line opens Applications on the matching button (`?view=queue|running|finished`).

No migration.

## [0.6.8.0] - 2026-11-22

### Added (round 8b, group 4)

- **"Choose" on a paid plan opens a checkout panel** over Subscription: the plan, its price and what is included. Basic still switches directly.
- **USC student verification by code**: with the "USC student" promotion checked, the panel asks for a @usc.edu address (only that ending), sends a 6-digit code by email (stored only as a keyed hash; 10 minutes; 5 tries; a new code after 60 seconds; at most 5 a day per account and per address), then six boxes for the code. One address verifies one account. The account is marked "USC student verified" with the date, the panel shows it and the student price applies; a verified account skips both steps. The same verification comes before an in-app Limelight request sent with the promotion. Without an email sender in production the step says "We can't send the code right now. Try again later." and logs it.
- **Beta card step** for every paid plan: the usual card fields, disabled, under "Card payments are not open yet. Do not enter your card details. Agental is in beta." Nothing is typed, sent or stored, no payment provider is called and the plan does not change. "Got it" closes the panel. The choice (plan, price, promotion, date) is recorded so the team can write when payments open.
- French copy from round 8b now uses "tu", like the rest of the app.

Migration `20261211000000_round8b_checkout` (two nullable User columns with a unique index on the USC address, two new tables with RLS on).

## [0.6.7.0] - 2026-11-22

### Changed (round 8b, group 3)

- **Applications in three sections**, in order: Search in queue, Search running, Search finished. A line at the top says "You can queue up to {n} searches. We run one every 6 hours." (the number comes from the plan).
- **One search every 6 hours**: each new search gets a scheduled start 6 hours after the performer's latest one, and each queued search shows "Starts soon" or "Starts in about 6 / 12 / 18 hours" from that time. The app's claim for the role-search workflow skips a search before its time (n8n itself is unchanged). Searches queued before this change keep no time and may start at once.
- **Deciding on a role found**: each role shows a full description first (role, project, dates, location, pay, what to send, the full notice and its source), then a green **Accept** and a red **Decline**. Accept marks it "Accepted: the Agental team is on it" and leads to the existing response flow. Decline records the decision and removes the role, with **Undo** for a few seconds.
- The dashboard Status links now open the matching Applications section.

Migration `20261210000000_round8b_search_schedule` (one nullable column on `role_search_requests`).

## [0.6.6.0] - 2026-11-22

### Changed (round 8b, group 2)

- **Wider pages**: the page column is about 12% wider with the sidebar open (81rem instead of 72rem) and wider again (90rem) when the sidebar is folded. Inputs, lists and tabs are slightly larger on wide screens.
- **Preferences in two columns** on wide screens: work types, paid or unpaid work, travel, work mode and animals on the left; ages you can play, skills, how we tell you about a role and content boundaries on the right. One column on a phone.
- **Settings menu on the left**: Account, Language, Notifications, Privacy and cookies, Subscription as a vertical menu with the chosen section beside it; a dropdown on a phone. Each section has its own address (`?section=notifications`), and older `#notifications` links still land there.
- **Dashboard**: the "Next action" link at the top is gone, so the rest moves up. The "Start finding roles" card now ends with a **Status** line (searches in queue, running, finished, roles found, each a link to Applications), refreshed every 30 seconds and right after a new search, and a "Check your applications" button at the bottom right.

No migration.

## [0.6.5.0] - 2026-11-22

### Changed (round 8b, group 1)

- **Sidebar menu button** now sits in the sidebar header, next to the logo, with the three-line menu icon; folded to icons it stays at the top of the icon column. Fold, widen, tooltip and Ctrl/Cmd+B are unchanged. On a phone the button stays in the top bar.
- **Profile, links block**: heading "Additional information that will help us", "(optional)" after the IMDb and portfolio labels in a lighter style, and the button "I don't have a website or portfolio link" (to Subscription, website section).
- **Accents**: the first option is "I don't do any accents"; choosing it clears the other accents and choosing an accent clears it. It is stored as `none` and kept out of casting views and matching.
- **Build** is a list (Slim to Plus size) with "Add your own", a short text field whose value shows in the tile. Earlier free-text values show as the person's own.
- **USC student promotion**: Limelight Signature $69 instead of $149, shown struck through like the other prices, in the app, on the public Limelight page and in the order price. The "College student? Verify your school email" card and link were removed from the app (the Promotions panel covers it).
- **AI agent setup in Messages** is saved on the account: Samantha, Adrian or a custom name, and what it helps with. Once saved, the card becomes one "Edit your AI agent" line that reopens the saved setup. The agent itself is not live.

Migration `20261209000000_round8b_agent_setup` (four nullable profile columns). `package.json` version brought back in line with `VERSION`.

## [0.6.4.0] - 2026-11-22

### Added (round 8, group 5)

- **Notification bell** in the Talent and Casting headers: an unread badge and a panel with the latest items (roles found, replies from the Agental team or the assistant, audition updates, product updates), "Mark all as read", and a link on each item. Refreshed every 60 seconds. In-app only: nothing is emailed, texted or pushed.
- Notifications are written by **database triggers**: a role drafted for the performer, a reply from the team or the assistant, and a casting status meant for the performer (self-tape requested, invited, contracted). Results that arrive later from n8n notify without touching n8n. A director's private shortlist, stars and exclusions never reach the performer, and the performer's own decisions do not echo back.
- **Admin > Announcements**: staff write product updates (title, short text, optional link, audience: all performers, all casting, everyone) and archive them; each person's read state is kept.
- **"When we find a role for you, tell me by"** Email (default), Text message or Both, in Preferences and in Settings > Notifications. Text needs a valid phone number and an explicit, unticked-by-default consent; the choice, the consent text version and its date are stored. Nothing is sent in round 8.

Migration `20261208000000_round8_notifications` (columns on the unused Notification table, two new tables with RLS on, three nullable profile columns, triggers whose functions are not callable by API roles).

## [0.6.3.0] - 2026-11-22

### Changed (round 8, group 4)

- **New prices** (founders, round 8): Limelight Essential hosting $25 a year (was $49), Signature $149 (was $199). Student prices as a "USC student" promotion (@usc.edu): Pro $9, Premium $29, Ultimate $59, Limelight Essential $29. Promotions are a list in `src/domain/pricing.ts`.
- **Promotions panel** above the plan cards, in the app's Subscription page and on the public pricing pages (one shared component): a "USC student" checkbox strikes the old price and shows the new one, plus two buttons that open an email to contact@agental.co (student plan price, student website price) with the account email. Replaces the "College student?" line.
- **Limelight on Subscription**: the plan cards, then the Limelight section (`#limelight`) with the two offers and the request form. Choosing Essential or Signature is now required (the student price shows when the promotion is checked); "Something custom" and "Help me choose" are gone. The offer, its price and any promotion are recorded with the request.
- **Public Limelight page** reads every price and hosting figure from the configuration.
- **Dashboard website card**: with no portfolio website, "Create your website" as before (IMDb alone never hides it); with one, a slim "Improve your website" line that opens the form on "Redo my website", with a close button that hides it for good.

Migration `20261207000000_round8_website_card` (one nullable column).

## [0.6.2.0] - 2026-11-22

### Added (round 8, group 3)

- **Location picker**: country first (United States by default, with search), then state or province where the country has them, then a city picked from suggestions as you type (free text refused; "Can't find your city? Pick the nearest one."). Data from GeoNames (CC BY 4.0) in our own database (`GeoCountry`, `GeoAdmin1`, `GeoCity`, 70,101 cities), searched by `/api/geo`; no API key, nothing sent to a third party.
- **Phone**: country code with flag on the left (+1 by default), the number formatted as typed ((213) 555-0123), validated with `libphonenumber-js` and stored in E.164 in a new column; the typed text stays.
- **Languages**: chips with search by name or code (FR, EN, ES, ZH); English, Mandarin, Spanish and French pinned, then every ISO 639 language A to Z, Mandarin and Cantonese separate, "Other" as free text.
- **Accents you can do**: a separate chip list grouped by region (about 200 accents), searchable by any word, "Other" as free text.
- Existing cities like "Los Angeles, USA" are linked when exactly one place matches; US phone numbers that parse cleanly get their E.164 form. Nothing typed is overwritten.

Migrations `20261206000000_round8_geo` (three new tables, RLS on) and `20261206010000_round8_location_phone` (four nullable columns and backfills into them).

## [0.6.1.0] - 2026-11-22

### Changed (round 8, group 2)

- **Profile in four tabs** (Identity, Physical, Media, Preferences). Specialties merged into Preferences: commercial and voice work map to project types, background and supporting to role types (applied on read until the performer saves Preferences once; no row is rewritten), the rest show under "Skills".
- **Autosave**: no Save button. Each field saves about 800 ms after typing stops, at once on blur and on a tab change; "Saving…", "Saved" or "Not saved." with Retry. Back, Next and Finish at the bottom of each tab; Finish below 100% opens the first missing field.
- **One definition of 100%** (`src/domain/completeness.ts`, list in `docs/DECISIONS.md`), used by the profile, dashboard, suggestions, assistant, admin and agent eligibility. Red asterisks on every required field.
- **Physical tiles**: ten square tiles (five per row on wide screens, two on a phone): height, weight (lb or kg), build, hair color, hair length, eye color, tattoos, piercings, clothing sizes, shoe size.
- **Preferences**: "Ages you can play" two-handle slider; "Paid work only" asks for the minimum day rate in a dialog and shows it with an Edit link (kept when unselected).
- **100% moment**: a short confetti burst (skipped with reduced motion), the completeness card folds away, "Your profile is complete. You're ready to launch AI searches." and, for unverified emails, a resend link. Stamped once (`profileCompletedAt`).
- **"Start finding roles" before 100%** opens a dialog that explains the automatic first search and opens the first missing field.
- **Media drag and drop**: drag a tile by its handle (mouse, touch, keyboard) inside or between categories; photos of yourself take images only, general videos take videos only, a wrong drop snaps back; the order is saved. Files dropped on a category that already has items upload there instead of making the browser leave the app. "Use my profile picture as my first headshot".
- Dashboard suggestions at 100%: a showreel first ("Casting looks at video first").

Migration `20261205000000_round8_profile_complete` (one nullable column).

## [0.6.0.0] - 2026-11-22

### Changed (round 8, group 1)

- **Collapsible sidebar** (Talent, Casting and admin, shadcn `sidebar`): the button at the top left, or Cmd/Ctrl+B, folds it to icons with a tooltip each and the page widens; the choice is remembered. On a phone the same button opens the menu as a sheet.
- **Bottom left of the sidebar**: only the account (picture and email). Sign-out stays in the avatar menu, the language in Settings (Casting and admin keep the language switch, their Settings have none).
- **No "Website" item**: Limelight (offers, your sites, the request form) is on the Subscription page under `#limelight`; the old Website page redirects there.
- **Identity**: legal first and last name ("Used for contracts and payments. Never shown to casting."), stage name now optional, gender (seven choices, "Other" with a short text), "Current city", bio up to 5,000 characters with a live counter, languages and accents moved here from Physical.
- **Physical**: hair color, hair length and eye color are lists. Earlier free text that matches an option for sure is shown as that option; anything else stays as typed and shows as "Other: ...".
- **Preferences**: Availability is hidden (its data stays) and the read-only copy of languages is gone.
- **Casting prices** read $95 per seat (Pro) and $295 (Studio), as in `docs/DECISIONS.md`.

Migration `20261204000000_round8_identity` (four nullable columns).

## [0.5.8.0] - 2026-11-22

### Added (round 7, admin site)

- **admin.agental.co**: the same app and database, reached by host. Only the admin pages and sign-in answer there; "/" opens the hub, everything else is 404. Signing in brings staff back to the admin. Non-admins get a 404 on admin pages (they used to be redirected home).
- **Data views** with search, filters and CSV: Profiles (computed completeness, media per category), Media (files open only through the private, short-lived link), Audit trail (search by action, resource or actor).
- **Email log**: every email the app sends is recorded (recipient, subject, kind, status), and Resend's signed delivery webhook (`/api/webhooks/resend`, `RESEND_WEBHOOK_SECRET`) moves it to delivered, bounced, complained or delayed. Page Admin > Emails, with CSV.

Migration `20261203000000_email_log` (new table, RLS on).

## [0.5.7.0] - 2026-11-22

### Added (round 7b, group 4)

- **The first AI search starts on its own** once a performer's profile reaches 100% and their email is verified, under the same server rules as a click (eligibility, quota, no duplicate, test mode in production). The dashboard says so: "We launched your first AI search. 4 of 5 searches left this month." Each plan has a monthly number of automatic searches inside its allowance (Basic: 1; Pro, Premium and Ultimate: 1 until the founders decide, `TODO(founders)` in `src/domain/pricing.ts`).
- **Answering a role from Applications**: each role found opens on its own page with its conditions (videos and questions). "Accept" opens a response form: a text box per question, and per requested video the choice to record it (saved in Reel & Self-tape, private, linked to the application) or pick one from there. "Submit" makes the response ready for the Agental team's review; nothing goes to a casting site. The status updates in Applications, and the admin lists submitted responses with answers and clips.

Migration `20261202000000_application_responses` (additive columns on Brief, ApplicationDraft and DraftMedia).

## [0.5.6.0] - 2026-11-22

### Changed (round 7b, group 3)

- **Agent eligibility is automatic**: an account is eligible once its email is verified (by the verification email, or by Google) and its profile is 100% complete. Staff no longer approve accounts; they only mark Spam, Test or Staff, or revoke eligibility ("Automatic" undoes a mark).
- **Email verification is read-only in the admin**: each account shows when it was verified (or "Verified by Google", or "Not verified"), with a filter. Nothing lets staff set it.
- **Account cleanup** in the admin (`/admin/suppression`): accounts never verified, older than 7 days (configurable), never paid and not staff or test; an optional "confirm within 7 days or your account is deleted" email; CSV export; "Delete all eligible" behind a typed confirmation, with files removed and one audit entry per account (email kept only as a hash). No deletion has been run.

Migration `20261201000000_account_deletion` (one additive column on User).

## [0.5.5.2] - 2026-11-22

### Changed (round 7b, group 2)

- **Profile > Media in four categories**: photos of yourself, past productions, general videos, other. Each item has a short description and can move to another category. Existing media moved to the closest category (photos to "Photos of yourself", videos to "General videos", the rest to "Other"). Each category counts in profile completeness.
- **Every uploaded item shows a preview**: the photo itself, a frame of the video with a play button (opens a player), an audio player for voice. iPhone photos (HEIC) are turned into JPEG in the browser before upload, since only Safari can display HEIC; a file the browser still cannot draw says so instead of showing an empty tile.
- **"Create your website" stays in the app**: the dashboard card opens Website in the app, which now has the Limelight request form when there is no site yet. It used to open the public Limelight page, whose header always shows "Sign in", which looked like being signed out.

Migration `20261130000000_media_categories` (two additive columns on Media, backfilled).

## [0.5.5.1] - 2026-11-22

### Changed (round 7b, group 1)

- **One "Complete your profile" block on the dashboard**: the percentage, the next missing item and a Resume button that opens the exact tab and field (for example Profile > Identity with the date of birth focused).
- **AI suggestions follow the profile's real data**: one list of missing items behind the dashboard, the suggestions, the assistant and the admin, so nothing already filled is asked for. A saved height is no longer asked for again, and one link (IMDb or portfolio) is enough for 100%. The admin shows the computed percentage instead of the stored one.
- **Avatar menu** at the top right with Profile, Settings and Sign out; the other sign-out buttons are gone.
- **Settings rebuilt** in five sections: Account (name, email, password, connected Google account), Language (saved on the account), Notifications (three email switches), Privacy and cookies, Subscription.
- **Cookie banner** for every visitor: it disappears as soon as a choice is made and stays gone; the choice is stored with its date and notice version, in the browser and on the account. Changeable in Settings > Privacy and cookies.
- **Reel & Self-tape** explains what a self-tape is for and where it goes, and a take can be downloaded before saving.

Migration `20261129000000_settings_consent` (four additive columns on User).

## [0.5.5.0] - 2026-11-21

### Added (round 7, branch `round7`)

- **Admin portal for accounts and AI work.** Each account has a status (Unreviewed, Approved, Test, Staff, Spam) that staff can change one by one or in bulk, with signup totals, filters and CSV. Admin also lists the conversations waiting for the Agental team (oldest first), applications and AI jobs with their states, and revenue as "Unavailable" until payments exist. Every change is in the audit log.
- **The AI agents start only for eligible accounts.** A search needs a verified email, an adult performer and the right status: Test while the app is in test mode (the default), Approved once the founders switch it to live. The server checks this at the click and again when n8n picks up the search.
- **Connection points for the n8n workflows "Beta V2" and "Beta V2 - Direct Replies".** Five routes for casting searches and email replies, closed (404) until the shared secret is set. Results arrive as drafts the performer sees under Applications, "Roles found for you", with the casting site link. Nothing is sent or submitted.
- **Limelight requests record where they came from** (the Limelight page or the app's site panel), and the confirmation scrolls into view after sending.

### Changed

- **Admin is limited to contact@agental.co in production.** An account with the admin flag and any other email is refused on every admin page and action.

## [0.5.4.0] - 2026-11-20

### Changed (round 6 part 2, branch `round6-part2-v2`)

- **Saving now confirms itself with a short message at the bottom of the screen.** Profile saves, uploads and sent messages show "Saved", "Uploaded" or "Sent" for a few seconds. Errors still appear next to the field or button that failed, so they stay on screen until you fix them.
- **Buttons show a spinner while they work** and ignore repeat clicks, without losing keyboard focus. Icon-only buttons in the media manager show their name on hover and on keyboard focus.
- **Deleting a recording asks first** in a proper dialog, with the recording's name, instead of the browser's own pop-up.
- **The phone menu is a sliding panel** in the Talent app, the Casting app and admin, with a Close button and the same theme as the page.
- **Loading screens** show the page's outline while it loads, in all three apps, and screen readers hear "Loading" once.
- **Cleaner controls:** the availability field is a styled list, the cookie choices are switches, and the AI search allowance and self-tape upload show a progress bar. Motion stays off when your system asks for reduced motion.
- Under the hood: the interface kit is shadcn/ui, mapped onto the Agental colors in both themes, with one copy of Radix (`radix-ui`) instead of three separate packages.

## [0.5.3.0] - 2026-11-20

### Changed (round 6 closeout, branch `round6-closeout`)

- **Talent prices are back to the original grid.** Premium is $49 a month and Ultimate $79 a month, and Ultimate's commission on bookings is 5%. Basic ($0, 10%) and Pro ($19, 10%) are unchanged, as are the search allowances (5, 50, 250, 500). Every place that shows a price, a commission or a search allowance now reads it from one table, `src/domain/pricing.ts`: the pricing page, the Talent page, the plan cards, the plan switcher, Subscription and the FAQ, in English, French, Spanish and Chinese.
- **The copy can no longer drift from the prices.** Plan feature lines and the FAQ answer about commission carry placeholders filled from the pricing table, and a test fails if a figure is typed back into that copy.

### Added

- **A permanent project memory.** `docs/DECISIONS.md` records the founders' decisions (products, prices, brand, stack, rules) and lists where the code still differs from them. `CLAUDE.md` tells every future session to read it first and never to change a price, plan, commission, allowance or brand rule without the founders' instruction.

## [0.5.2.0] - 2026-11-20

### Changed (2026-11-20, round 6 part 1, branch `round6`)

- **Your cookie choice now follows your account.** Signing out and back in, or using the same browser for two accounts, no longer brings back a different choice. When the browser and the account disagree, the stricter answer wins for each category, so a refusal is never undone without you choosing again.
- **Settings › Cookie preferences shows what this browser actually applies** and says "Your choice is saved" only once the account has it. If the save fails, the browser keeps its previous choice and the error is shown.
- **Keyboard users keep their place** after pressing a cookie button in Settings; focus no longer jumps to the top of the page while the choice saves.
- **Safer move of stored files from R2 to Supabase** (admin route `/api/admin/storage/copy`). The dry run reports sizes, what Supabase already holds, whether the copy fits the Free plan, and every file the database points to, profile pictures included. The copy moves only files an account still uses, passes over broken, oversized or vanished files, and logs failures without file names.

### Changed (2026-11-18, front-end redesign, branch `frontend-redesign`)

- **Two mirrored themes, one accent.** Talent and Limelight run from white to pale blue (`#FFFFFF` to `#DCEAFF`) with near-black text; Casting runs from near-black to deep blue (`#080B12` to `#102B63`) with white text. Both share the accent `#246BFE`. The Green room and Spotlight palettes, the four web fonts and the scroll-tied animations are gone; type is Helvetica Bold and Regular from the system. Tokens and contrast figures: `src/app/globals.css`.
- **The A monogram** replaces the "T" tape mark and the four-point star everywhere, app icons included. Files and usage: `brand/README.md`.
- **Public site.** The entry screen is two tiles ("I'm a performer", "I cast roles") that lead to account creation. Both landings are down to a hero, the steps to join, and compact plan cards; Limelight shows a sample site first, then the offers and the form. No photos of people and no testimonials. Plan prices are read from `src/domain/pricing.ts` and shown in US dollars.
- **Signed-in apps.** New shell (`src/components/app/app-shell.tsx`): sidebar flush with the left edge from 768px, sticky top bar and menu sheet below, in the Talent app, the Casting app and admin. The plan badge at the top right opens a plan switcher. Text that was hard-coded in French now comes from the message files in all four locales.
- **Career page.** Shows Roles booked, Gross fee and Net received; the commission figure and column are removed.

Details by task, decisions and open items: `docs/FRONTEND_AUDIT.md` and `docs/FRONTEND_BACKEND_HANDOFF.md`.


### Changed

- **Portail Talents : système « Green room » (2026-11).** Le portail Talents passe
  au sable `#ece3d3` et au blanc, avec un seul accent vert `#1f5c47` réservé aux
  actions. Titres en Big Shoulders Display (police condensée d'affiche),
  texte en Instrument Sans, toutes deux auto-hébergées depuis `src/assets/fonts`
  (licence OFL, aucun appel à Google). Boutons rectangulaires (6 px) et en-tête
  à angles de 12 px sur Talents ; le repère de ruban en T remplace l'étoile à
  quatre branches côté Talents. Le portail Casting est inchangé : les nouvelles
  valeurs vivent dans un bloc `[data-portal="talents"]` dédié (comparaison
  visuelle avant/après de la landing Casting identique).
- **Mouvement au défilement sur les pages Talents.** Une bande de ruban se pose
  sous chaque titre de section, les portraits se révèlent comme au labo, et le
  panneau de scène dérive au défilement. Animations CSS pilotées par le scroll,
  repli par `IntersectionObserver` (`src/components/talents/scroll-motion.tsx`)
  pour les navigateurs sans support, états finaux sous `prefers-reduced-motion`.
- **Sélecteur Talents | Casting dans l'en-tête, des deux côtés, à toutes les
  largeurs.** Il remplace le lien « Are you a casting director? », qui ne
  s'affichait qu'à partir de 1536 px de large : sur un portable ou un téléphone,
  on ne trouvait pas l'autre portail.
- **Lien « Limelight by Agental » dans le pied de page**, des deux côtés, à
  côté d'Agental Talents et d'Agental Casting. Suite côté backend :
  `docs/BACKEND_NEXT_STEPS.md`.
- **Landing Talents allégée.** « Devenir membre » et « Voir comment ça marche »
  sont dans le panneau de scène, dès le premier écran ; le grand wordmark
  au-dessus du panneau et la bande de neuf portraits sont retirés (les types de
  casting restent, en liens). Les cinq étapes deviennent un parcours cliquable
  (`src/components/talents/join-steps.tsx`) : boutons radio natifs et `:has()`,
  donc clavier, sans JavaScript, et une illustration par étape.
- **Page « Qui sommes-nous » : section équipe retirée** (« Ce qui nous
  rassemble » et les trois prénoms), dans les quatre langues.

### Added

- **Limelight by Agental, `/[locale]/talents/limelight`.** Page de l'offre de
  sites web pour les artistes : maquette de site qui se construit au défilement,
  trois étapes, planche-contact de six modèles qui défile à l'horizontale en
  section épinglée, deux offres (Essentiel 99 $, Signature 199 $, hébergement
  renouvelé à 49 $ ou 79 $ par an après la première année), FAQ et formulaire
  « Lance ton site ». Le nom, le slug et les prix vivent dans
  `src/domain/limelight.ts`. Le formulaire passe par la server action
  `src/app/actions/limelight.ts`, qui transmet au workflow n8n signé en
  HMAC-SHA256 quand `LIMELIGHT_LEADS_WEBHOOK_URL` et `N8N_SIGNING_SECRET` sont
  posés, et ne fait que journaliser sinon. Champ piège anti-robots, limite de
  cinq envois par visiteur et par dix minutes, longueurs plafonnées. Paiement en ligne non branché :
  à ouvrir après l'avis de l'avocat. Lien « Sites web » dans la navigation
  Talents et bandeau d'appel sur la landing.

- **Refonte v1 (« Spotlight »), d'après les quatre planches de référence de
  l'équipe design.** Nouvelle couche de tokens dans `globals.css` : fond papier
  neutre, encre franche et une seule couleur signal (le gaffer de plateau),
  réservée aux marques ; Talents reste clair, Casting devient la scène sombre.
  Geist Sans / Geist Mono remplacent Instrument Sans / JetBrains Mono, servies
  par le paquet `geist` (aucun appel à Google Fonts au build). Boutons pilule,
  en-tête flottant en pilule avec un lien « Se connecter », pied de page avec
  le wordmark bord à bord. Les deux landings sont reconstruites : wordmark
  scindé au-dessus d'un panneau de scène (une poursuite sur un comédien côté
  Talents, la démo de short-list en direct côté Casting), planche-contact des
  types de casting, cartes encadrées en filets, étapes numérotées, tableau des
  commissions. Les blocs partagés vivent dans
  `src/components/marketing/blocks.tsx`. Les autres pages héritent des tokens
  sans modification de code.
- **`/<locale>` devient une entrée à deux portes** (Talents / Casting) au lieu
  de rediriger vers Talents (proposition pour la décision D18).
- **Quatre locales : anglais (défaut), français, espagnol, chinois.** Chaque
  locale garde son préfixe (`/en`, `/fr`, `/es`, `/zh`) ; une URL sans préfixe
  est négociée vers la langue du visiteur, l'anglais à défaut. Les types de
  messages dérivent de `messages/en`. Le chinois est nouveau : toutes les clés
  sont traduites (Talents dit « 你 », Casting « 您 »), `<html lang>` et
  hreflang portent `zh-Hans`, et `globals.css` contient des règles de
  composition chinoise (pas d'interlettrage négatif, interlignage ouvert,
  titres coupés à la ponctuation). `/zh` reprend les portraits US en attendant
  un jeu dédié.
- **Le sélecteur de langue devient un menu globe dans l'en-tête**, et une
  liste complète des noms natifs dans le menu mobile, les écrans de connexion
  et la barre latérale de l'application.

### Added

- **Un mode démo pour enregistrer une vidéo du produit : `?demo`.** Ouvrez
  `/en/talents?demo`, lancez l'enregistrement d'écran, cliquez une fois : une
  visite scriptée d'environ 35 secondes enchaîne la landing Talents (les cinq
  étapes, le studio self-tape) puis la landing Casting, où le brief de la carte
  de démo est retapé, la short-list générée et la source de chaque profil
  mise en avant, avant un écran de fin. Légendes en bas d'écran, cartes de
  chapitre plein écran, curseur masqué. `R` relance la prise, `Échap` quitte
  le mode. Tout ce que la caméra filme entre les cartes est l'interface réelle :
  le lecteur ne fait que défiler, cerner, taper et cliquer sur les éléments
  marqués `data-demo="…"`. Les noms et scores de la carte de démo portent la
  mention « Demo data » à l'écran et sur l'écran de fin. Sans le paramètre,
  rien ne change pour les visiteurs : le lecteur est un chunk chargé à la
  demande. La visite est en anglais et force `/en`.

## [0.5.1.0] - 2026-09-07

### Changed

- **La carte de démo du portail casting adopte le langage visuel des maquettes.**
  C'est le premier écran que voit un directeur de casting, et c'était le dernier
  bloc resté à l'ancien style après la refonte : la sélection s'affiche
  maintenant avec un bandeau de résultat, un score en gros chiffres et une barre
  qui en donne la mesure d'un coup d'œil.

### Fixed

- **Le compteur de profils s'affiche au format de la langue lue.** « 1 240 » en
  français, « 1,240 » en anglais, « 1240 » en espagnol. La valeur était écrite en
  dur au format français, donc les visiteurs anglophones et hispanophones
  voyaient une espace de groupement qui n'existe pas chez eux.

- **Le badge « dispo » était en français sur les trois versions du site.** Il
  affiche désormais « available » sur `/en` et « disponible » sur `/es`.

## [0.5.0.0] - 2026-09-06

Refonte du site public d'après les maquettes New LP, dans les trois langues.

### Added

- **Des visages sur le site.** Le collage du hero Talents affichait quatre cases
  vides avec une légende ; il montre maintenant quatre portraits, différents
  selon la langue : un visiteur sur `/fr` ne voit pas les mêmes personnes que
  sur `/en` ou `/es`. Les cartes du hub `/castings` et le chapô de chaque
  landing SEO sont illustrés par tranche d'âge.

- **Une neuvième landing de casting : « Performeurs & scène ».** Danse, musique,
  magie, cirque, animation, cascade. Elle apporte aussi la spécialité
  correspondante à l'inscription : un performeur arrivé par Google peut
  désormais s'inscrire dans sa discipline.

- **Une FAQ sur chaque landing SEO**, avec ses données structurées, là où ces
  pages étaient entièrement en texte suivi.

- **Une section « Des candidatures qui décrochent des réponses »** sur la landing
  Talents, avec sa réserve de méthode affichée.

### Changed

- **Toute la typographie du site public.** Instrument Sans remplace Inter et
  Fraunces ; les intitulés de section, les numéros d'étape et les montants
  passent en JetBrains Mono. Les titres gagnent en poids et se resserrent.

- **Les textes des deux portails sont nettement plus précis** : cachets
  indicatifs, méthode, protections légales des mineurs. Écrits en français puis
  traduits en anglais et en espagnol.

- **La page « Qui sommes-nous »** raconte l'origine du projet et présente trois
  personnes au lieu de deux.

- **Le sélecteur de langue** affiche `FR · EN · ES` au lieu des noms complets sur
  écran large : le header tenait sur deux lignes et se réempilait.

### Fixed

- **La bande finale de la landing Talents était invisible.** Elle était écrite
  avec des classes de couleur qui ne rendent rien : la feuille de styles
  n'expose que des rôles, et `bg-espresso` n'en est pas un. Vingt-quatre classes
  de ce type existaient dans le dépôt, dont l'overlay des fenêtres modales, qui
  n'assombrissait donc rien, et la pastille d'enregistrement du studio
  self-tape, qui n'avait aucun remplissage.

- **Le bouton principal du portail Casting devenait illisible au survol.** Le
  texte blanc tombait à 3,36:1 sur la couleur de survol, sous le plancher
  d'accessibilité, parce que celle-ci était plus claire que la couleur de repos.

- **Les coches des formules tarifaires étaient presque invisibles** sur la carte
  mise en avant du portail Casting : 1,71:1, alors qu'elles sont la seule chose
  qui indique ce qu'une formule inclut.

- **Les coches de validation des short-lists** échouaient déjà l'accessibilité
  avant cette version (4,48:1) ; le vert retenu monte à 7,86:1.

- **Les pages FAQ n'avaient plus qu'un seul titre**, ce qui supprimait la
  navigation par titres au lecteur d'écran sur les deux pages les plus longues
  du site.

- **Le site débordait de 58 pixels sur mobile** sur la landing Talents.

- **Les liens de langue mesuraient 23,92 pixels de large**, sous le plancher de
  24 imposé aux cibles tactiles.

- **La carte de partage sur les réseaux était fabriquée à chaque partage** au
  lieu d'être générée une fois : les robots abandonnaient avant la fin.

## [0.4.1.1] - 2026-08-31

### Fixed

- **Les titres d'onglet des pages privées étaient français dans les trois
  langues.** Quinze pages — les deux espaces, l'administration — exportaient un
  `metadata` statique, forme qui ne peut pas être localisée. Elles passent en
  `generateMetadata`, la seule forme que la documentation de Next 16 décrit.
  Presque toutes les clés existaient déjà.

  Le guide de style reste statique : c'est une page de développement derrière la
  garde admin, laissée hors périmètre de traduction par le plan. La raison est
  désormais écrite dans le fichier.

## [0.4.1.0] - 2026-08-31

### Fixed

Cinq écrans restaient français dans les trois langues. Les chaînes vivaient
dans des constantes de module, hors de portée de la garde lexicale.

- **L'assistant de brief** — les sept questions, leurs exemples et les options
  de genre. C'est le parcours par lequel un directeur de casting crée un projet.
- **Le tableau de bord talent** — quatre indicateurs, trois suggestions et le
  message d'accueil.
- **Les deux écrans d'abonnement** — les descriptions de formules, « Sur devis »
  et les unités de prix.
- **La démo interactive** de la page casting — les justifications de la
  short-list et l'unité de tarif journalier.
- **« Types de casting »** dans la navigation des landings, à côté de trois
  appels `t()`. Signalé par la revue de design initiale comme corrigé ; il ne
  l'avait jamais été.

### Changed

- **L'écran d'abonnement talent vendait encore des promesses retirées.** Il
  affichait « Auto-candidature IA », « 10 candidatures/j », « 50
  candidatures/j », « Illimité » — exactement ce que la passe sur le discours
  tarifaire avait supprimé des fichiers de messages en v0.2.0.0. La version
  corrigée existait, traduite dans les trois langues, et n'avait jamais été
  branchée. Elle l'est.

  Même schéma pour le tableau de bord talent, dont les sept libellés traduits
  attendaient un appelant.

## [0.4.0.1] - 2026-08-31

### Fixed

- **L'en-tête d'un projet de casting restait français** dans les trois langues :
  « Rôle « Maxime » · 25–32 ans · accent breton · 4 profils retenus ». Il était
  assemblé par concaténation, ce qui ne peut pas marcher : les guillemets
  changent de forme selon la langue (« » / “ ” ), « 25–32 ans » se dit « ages
  25–32 », et le nombre de profils demande une règle de pluriel.
- **La liste de candidatures d'un talent était française de bout en bout** alors
  que le fichier appelait déjà `useTranslations` : les cinq onglets de filtre,
  les huit libellés de statut et le badge « Auto IA / Manuelle ». Statuts et
  onglets vivaient dans des constantes de module, hors de toute portée que la
  garde lexicale inspecte.

  Les libellés de statut sont écrits du point de vue du talent — « Envoyée »,
  « Invitée en audition », « Sans suite » — là où `app.candidatureStatus`, qui
  n'a aucun utilisateur, les nomme côté casting. Cette perspective est du choix
  éditorial : elle est traduite, pas écrasée.

## [0.4.0.0] - 2026-08-31

### Changed

- **L'explication d'une shortlist n'est plus une phrase, mais des raisons
  structurées.** Elle était construite en français sur le serveur et persistée,
  alors que trois personnes la lisent — le directeur de casting qui a lancé le
  brief, un collègue de son organisation, et le talent lui-même via sa liste de
  candidatures. Elle était française pour toutes, dans les trois langues.

  `MatchScore.justification` devient `MatchScore.reasons`, du JSON, comme
  `factors` et `diversityFlags` l'étaient déjà. **Migration destructive** : la
  colonne portait du texte généré, réécrit à chaque relance de matching.
- **Le scorer LLM choisit désormais dans une liste fermée** au lieu de rédiger.
  C'est un vrai renoncement — la prose est ce qu'un modèle fait de mieux — mais
  une explication persistée et relue par plusieurs personnes ne peut pas vivre
  dans une seule langue.

### Fixed

- « Mineur » et « profil similaire » étaient codés en dur sur les cartes de
  shortlist. La garde lexicale ne pouvait pas les voir : aucun mot-marqueur
  français n'y figure.

## [0.3.2.1] - 2026-08-31

### Fixed

- **Les conseils de self-tape s'affichaient en français dans les trois
  langues.** Un talent enregistre sa prise et lit « Rapproche-toi du micro et
  coupe les bruits de fond » quelle que soit sa langue — le texte le plus lu de
  l'écran, puisqu'il apparaît après chaque prise. Le scorer construisait des
  phrases sur le serveur ; il renvoie maintenant des clés, rendues côté client
  dans la langue du visiteur. Le type `TipKey` est dérivé du fichier de messages
  comme `ErrorKey`, donc une clé inexistante échoue au typecheck.
- **La ligne « Cadrage · Lumière · Son »** au-dessus des conseils était codée en
  dur alors que les trois clés existaient déjà.
- **Le paramètre du `.map()` s'appelait `t`**, masquant la fonction de
  traduction : rien n'aurait pu être traduit à cet endroit sans le renommer.

## [0.3.2.0] - 2026-08-31

### Fixed

- **Le matching IA échouait en silence.** `getScorer()` renvoyait le scorer
  déterministe quand `SCORER=llm` était demandé sans clé API, et
  `LlmScorer.score()` avalait toute exception sans un log. Un déploiement
  convaincu d'avoir activé le matching IA servait donc des scores calculés par
  une heuristique, chacun accompagné d'une justification rédigée, à un directeur
  de casting — rien ne les distinguait d'un vrai matching.

  `SCORER=llm` sans clé est maintenant refusé avec un message qui dit quoi
  faire. Un échec à l'exécution — limite de débit, refus du modèle, réponse hors
  schéma — continue de retomber sur le scorer déterministe, parce qu'il ne faut
  pas casser un brief en cours, mais il est journalisé à chaque fois.

### Changed

- Le modèle passe de `claude-opus-4-8` à `claude-opus-5` : même tarif, plus
  capable. **L'identifiant précédent était valide** — `TODOS.md` affirmait le
  contraire depuis la revue initiale, ce qui était faux et n'avait jamais été
  vérifié. L'entrée est corrigée.

## [0.3.1.5] - 2026-08-31

### Fixed

- **Le widget de rentabilité de l'abonnement était en français partout.** Phrase
  d'introduction, les quatre en-têtes du tableau et la mention « (actuel) ».
- **La commission s'affichait « 10 %% ».** `percent()` émet déjà le signe, et le
  gabarit en ajoutait un second. Visible dans les trois langues.

### Changed

- **La garde `i18n:check` ne s'arrête plus au premier `useTranslations`.** Elle
  exemptait du scan de texte JSX tout fichier qui en appelait un, sur
  l'hypothèse qu'un tel fichier était traduit. La traduction partielle est le
  cas courant, pas l'exception : c'est ainsi que l'éditeur de profil a gardé
  seize chaînes françaises tout en étant rapporté propre. Les commentaires sont
  maintenant retirés avant l'analyse — le motif de texte JSX traverse les
  retours à la ligne, donc un bloc de commentaire entre `>` et `<` se lisait
  comme du texte affiché.

  Restent deux signalements, tous deux assumés : le guide de style interne, non
  traduit et derrière la garde admin, et `global-error.tsx`, qui vit hors du
  provider intl et ne peut pas l'être.

## [0.3.1.4] - 2026-08-31

### Fixed

- **L'éditeur de profil restait en français dans les trois langues.** Les cinq
  onglets et onze libellés de champs étaient codés en dur : un anglophone sur
  `/en/talents/app/profil` lisait « Identité · Physique · Médias · Spécialités ·
  Préférences » au-dessus de « Nom artistique », « Corpulence », « Cachet
  minimum ». Seize chaînes passent dans `space.profileEditor`, traduites en
  anglais et en espagnol.

  La garde `i18n:check` ne pouvait pas le voir : elle exempte du scan de texte
  JSX tout fichier qui appelle `useTranslations`, et celui-ci en appelait déjà
  pour d'autres chaînes. Une exemption par fichier laisse passer les oublis
  partiels, qui sont le cas le plus courant.

## [0.3.1.3] - 2026-08-31

### Fixed

- **Les 18 appels à `revalidatePath` ne correspondaient à aucune route.** La
  fonction s'applique à l'arborescence des **fichiers**, pas aux URLs : elle
  attendait `/[locale]/talents/(space)/app/profil` et recevait
  `/talents/app/profil`. Vérifié plutôt que supposé — aucun des anciens chemins
  n'existe sur le disque, tous les nouveaux existent. Un appel qui ne
  correspond à rien n'émet ni avertissement ni erreur : il ne laisse que des
  données périmées, ce qui explique qu'ils aient survécu à une revue complète.

### Added

- **Deux gardes ESLint sur `revalidatePath`** : un chemin qui ne commence pas
  par `/[locale]/` est refusé, et le second argument (`"page"` ou `"layout"`)
  devient obligatoire, puisque toute route de ce projet contient le segment
  dynamique `[locale]`. Les deux règles ont été vérifiées sur des appels
  volontairement fautifs.
- **Un test qui vérifie que chaque chemin désigne une route réelle.** ESLint ne
  contrôle que la forme ; c'est un renommage de route qui recréera le problème,
  et lui seul peut l'attraper. Le test vérifie aussi qu'il trouve bien les
  appels, pour qu'un passage au vert veuille dire quelque chose.

## [0.3.1.2] - 2026-08-31

### Fixed

- **Se connecter ne menait nulle part.** Le formulaire créait bien la session,
  puis l'utilisateur restait sur la page de connexion — sans message, donc
  impossible à distinguer d'un mot de passe refusé. `redirectTo` était passé à
  NextAuth sans préfixe de locale (`/talents/app`), or NextAuth redirige vers
  cette valeur telle quelle : il ne connaît pas next-intl. Le routeur client
  allait chercher la charge RSC de `/talents/app`, le proxy répondait 307 vers
  `/fr/talents/app`, le routeur ne suivait pas, et rien ne se passait.
- **Même défaut à l'inscription**, et c'est là qu'il coûtait le plus cher : un
  anglophone qui créait son compte se retrouvait renvoyé vers l'onboarding
  français. `/en/talents/inscription` reste désormais en anglais.

  Les destinations sont extraites dans `src/domain/auth-routes.ts` — un module
  `"use server"` ne peut exporter que des fonctions async, donc rien n'y était
  testable. Sept tests couvrent les trois locales, les deux portails, et le
  repli sur la locale par défaut quand la valeur du formulaire est inconnue.

## [0.3.1.1] - 2026-08-31

### Fixed

- **La galerie de médias ne se mettait pas à jour après un ajout ou une
  suppression.** Le talent téléversait sa photo, ne la voyait pas apparaître, et
  recommençait. `ProfileEditor` faisait `useState(initial)` puis passait
  `data.media` à la galerie : `useState` ne lit son argument qu'au premier
  montage, donc chaque rendu serveur suivant — celui que `router.refresh()` va
  chercher après l'action — était jeté, et la galerie restait sur son premier
  instantané. Elle lit désormais `initial.media` directement. Les champs du
  formulaire, eux, sont bien un brouillon et restent sur `data`.

  Ni `revalidatePath` ni `router.refresh()` n'étaient en cause : vérifié en
  comparant une charge RSC fraîche du serveur, qui contenait déjà le nouveau
  média, au DOM, qui ne l'avait pas.

## [0.3.1.0] - 2026-08-31

### Added

- **Stockage des médias sur Cloudflare R2.** Photos, bandes démo et self-tapes
  étaient écrits dans `<cwd>/.uploads` : sur un hébergement serverless, le
  premier redéploiement les effaçait. L'interface `Storage` existait déjà et
  annonçait ce remplacement ; c'est un adaptateur de plus derrière elle, pas une
  refonte. Sélection par variables d'environnement, donc une préversion peut
  viser le même bucket sans changer une ligne de code.
- **Lecture par URL signée.** `/api/media/[id]` vérifie l'autorisation comme
  avant, puis redirige vers une URL R2 valable 5 minutes au lieu de faire
  transiter les octets. Un self-tape de 50 Mo n'a plus à tenir dans la mémoire
  d'une fonction, ni à être recopié dans la réponse. La redirection elle-même
  n'est jamais mise en cache : elle survivrait à la signature qu'elle porte.

  Bucket `agental-media`, localisation EU, pour rester avec la base Supabase
  eu-west-1. Vérifié contre le vrai bucket : écriture, relecture octet pour
  octet, `fetch` de l'URL signée en 200, suppression.

### Changed

- **Une configuration de stockage partielle est refusée.** Trois variables R2
  sur quatre, c'est une faute de frappe ; retomber sur le disque local dans ce
  cas « fonctionnerait » jusqu'au premier fichier disparu. En production, aucune
  configuration du tout est la même erreur, un cran plus tôt. Le message nomme
  les variables manquantes.
- Les dépendances `@prisma/adapter-libsql` et `@libsql/client`, devenues
  inutilisées avec le passage à Postgres, sont retirées.

## [0.3.0.0] - 2026-08-31

### Changed

- **La base passe de SQLite à PostgreSQL (Supabase),** en local comme en
  production. Le schéma avait été écrit portable exprès — pas d'enum natif, pas
  de `Json`, pas de liste scalaire, montants en centimes entiers — donc seul le
  `datasource` change : aucun modèle n'est touché. L'adaptateur `@prisma/adapter-libsql`
  devient `@prisma/adapter-pg`.
- **Les migrations SQLite sont remplacées par une migration Postgres unique.**
  Les trois précédentes étaient du DDL SQLite, inapplicable sur Postgres ;
  aucune base de production n'existait encore, donc rien n'est perdu. 27 modèles,
  27 tables, vérifié.
- **Deux chaînes de connexion, pas une.** `DATABASE_URL` vise le pooler de
  transactions (port 6543), que l'application utilise parce qu'une fonction
  serverless ouvre une connexion par invocation. `DIRECT_URL` vise la connexion
  directe (port 5432), que seul `prisma migrate` utilise : le pooler ne supporte
  pas les instructions de session dont le DDL a besoin.

### Fixed

- **Une base absente ne passe plus inaperçue.** `src/lib/db.ts` retombait sur
  `file:./dev.db`, un fichier gitignoré donc absent de tout déploiement : le
  site démarrait en paraissant sain et échouait à la première requête. La
  variable est désormais lue sans valeur de repli, et le message d'erreur dit
  quoi faire. Le build échoue franchement si elle manque, au lieu de livrer une
  application qui ne peut pas répondre.

## [0.2.0.2] - 2026-08-31

### Fixed

- **Chaque canonical pointait vers une redirection.** Le domaine apex
  `agental.co` répond 308 vers `www.agental.co`, mais l'origine par défaut de
  `src/lib/seo.ts` était l'apex : les 57 URLs du sitemap, les `canonical`, les
  `hreflang` et les URLs Open Graph déclaraient tous une adresse que le site ne
  sert pas. Une page qui se déclare canonique là où elle redirige se contredit.
  L'origine par défaut devient `https://www.agental.co`, réglable comme avant
  par `NEXT_PUBLIC_SITE_URL`.

## [0.2.0.1] - 2026-08-31

### Fixed

- **Le déploiement échouait avant même de compiler.** `prisma.config.ts`
  résolvait `DATABASE_URL` avec le helper `env()` de `prisma/config`, qui lève
  une exception au chargement de la configuration quand la variable est absente.
  Comme `postinstall` lance `prisma generate`, `bun install` sortait en 1 sur
  tout hôte de build — là où aucun `.env` n'existe — et le build ne démarrait
  jamais. `prisma generate` n'a pourtant besoin d'aucune base : seuls `migrate`
  et `db push` en ont besoin, et ils tournent là où la variable est définie. La
  configuration retombe désormais sur le même défaut que `src/lib/db.ts`.

## [0.2.0.0] - 2026-08-31

Le site devient réellement trilingue, du premier écran au tableau de bord, et
se déclare correctement aux moteurs de recherche.

### Added

- **Espagnol.** Trois langues servies : `/fr`, `/en`, `/es`. Chaque langue porte
  son préfixe, y compris le français, et une URL sans préfixe négocie vers la
  langue du visiteur au lieu de dépendre d'un cookie.
- **Traduction complète de l'application connectée.** Inscription, connexion,
  onboarding, espaces Talents et Casting, admin : plus une seule chaîne
  française codée en dur, attributs d'accessibilité compris.
- **Sélecteur de langue partout.** Il n'existait que dans l'en-tête marketing :
  la langue ne pouvait plus être changée une fois l'inscription commencée. Il
  affiche désormais les noms natifs (Français · English · Español) et conserve
  les paramètres d'URL.
- **SEO technique.** Balises `canonical`, `hreflang` pour les trois langues plus
  `x-default`, Open Graph et Twitter, avec une carte de partage générée par
  locale. Données structurées `Organization`, `Service`, `BreadcrumbList` et
  `FAQPage`.
- **Pages 404 et erreur**, dans la langue du visiteur et avec la navigation du
  site. Le framework servait jusque-là son écran par défaut, non stylé et en
  anglais.
- **Manifeste web et icônes d'application.** « Ajouter à l'écran d'accueil »
  produisait une vignette vide.
- **Mesure d'audience** sans cookie, désactivée tant qu'aucune variable
  d'environnement n'est posée.
- **Tests.** Vitest couvre la réconciliation des shortlists, les erreurs de
  server action, le formatage `Intl` et les URLs SEO ; un test d'intégration
  vérifie la règle d'accès aux médias contre la vraie base.
- **Deux gardes exécutables.** `bun run i18n:check` vérifie la parité des clés
  entre locales, `bun run a11y:check` vérifie qu'aucune cible interactive ne
  passe sous le seuil tactile à 375 px.

### Fixed

- **Les médias étaient lisibles par n'importe qui.** `/api/media/[id]` n'avait
  aucune authentification et diffusait photos, bandes démo et self-tapes — ceux
  de mineurs compris — à qui connaissait un identifiant. L'accès est désormais
  réservé au talent propriétaire, aux organisations qui l'ont mis en shortlist,
  et à l'administration.
- **Relancer un matching détruisait le travail du directeur de casting.**
  Statuts de shortlist, historique et dates de candidature étaient effacés puis
  recréés. Les décisions humaines survivent maintenant à une relance.
- **Les huit pages de types de casting servaient du français en anglais.**
  Le contenu était codé dans un fichier de données ; il vit désormais dans les
  fichiers de traduction, et les cachets sont formatés selon la locale.
- **Le domaine était faux partout.** Le sitemap, `robots.txt` et les métadonnées
  pointaient vers un domaine de parking tiers.
- **Le menu mobile s'annonçait en français** aux lecteurs d'écran anglophones et
  hispanophones.
- **Le bouton d'appel à l'action échouait au contraste WCAG AA** (3,94:1 pour un
  seuil de 4,5). Corrigé, ainsi que le texte secondaire et les bordures de champ.
- **Cibles tactiles.** Le menu mobile, les liens de pied de page et le sélecteur
  de langue passaient sous le seuil d'accessibilité sur téléphone.
- **Les champs de formulaire déclenchaient un zoom sur iOS** au focus.
- **Les montants et les dates s'affichaient au format français** quelle que soit
  la langue ; la commission affichait « 7,5 % » en anglais.
- **Les messages d'erreur restaient en français** dans toutes les langues : ils
  traversaient la frontière serveur/client déjà rédigés.

### Changed

- **Le discours tarifaire décrit ce que le produit fait.** Les pages tarifs, la
  FAQ et l'écran d'abonnement annonçaient une auto-candidature par l'IA et des
  quotas quotidiens qui n'existent pas dans le code. Le taux de commission, lui,
  est réel et devient le différenciateur affiché.
- `robots.txt` n'expose plus les espaces connectés, l'administration ni la page
  de connexion.
- Le guide de style interne, jusque-là public, passe derrière l'authentification
  administrateur (`/admin/styleguide`).
- Le fichier de proxy suit la convention Next 16 : `src/middleware.ts` devient
  `src/proxy.ts`. Même rôle — c'est le seul endroit où la locale d'une requête est
  résolue — mais le nom change, donc cherchez-le là.

### Notes

Le blog Sanity, prévu au plan, est différé. `TODOS.md` liste ce qui reste, avec
sa preuve et son déclencheur de reprise — dont deux points bloquants avant toute
mise en ligne : le stockage média ne survit pas à un hébergement serverless, et
les mentions légales n'existent pas.
