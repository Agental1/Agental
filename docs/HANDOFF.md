# Handoff for the next model or person

Updated 2026-11-22 (round 10 in progress: read "Round 10 (2026-11-22): start here" first). Older notes: "Round 9" below, the Round 9 carryover, then "Round 7b" for
the details behind each line, `docs/STATUS.md` and `docs/RELEASES.md`.

## Round 10 (2026-11-22): start here

Brief: `Agental_Cowork_Round10_Prompt.md` (Desktop). Groups 1 to 4 run without the founder; Group 5
waits for "Here I am, I can allow everything now", then goes through "Waiting for Jérôme" (in the
Round 9 section below, plus the round 10 items here) step by step.

Live before round 10: Version 57.

| Group | State | Version |
|---|---|---|
| 1. Profile fixes (+ W14 demo admin removed) | live | 58 |
| 2. Sign-up code and onboarding | live; sending the code waits for W0 (Resend) | 59 |
| 3. The green button | live; reset 17 accounts (5 waiting searches canceled); the production test (3.5) waits for W0 and W17 | 60 |
| 4. A clearer admin | live (type, Test badge, Can search, one set of counts, Cookies) | 61 |

### Why the green button failed for the founder's new account (3.1, read from production 2026-11-23)

The account (email and password, created 2026-11-23, profile 100%, build included) never verified its
email: production has no Resend key, so no verification email was ever sent (the email log has no
row for it). It is also a regular account, and production is in test mode, where only Test accounts
may start a search, so even a verified address would have been refused. Quota, slots and n8n played
no part (no search was ever queued for it); the button now names the first blocker ("Verify your
email...") and, once verified, "AI searches open soon..." until the founder flips Admin > Controls.

### Waiting for Jérôme (round 10 additions)

0. **W0 (top priority), Group 2: Resend, so the sign-up code reaches people.** Nothing can send
   email from production yet: `RESEND_API_KEY` is not set (`EMAIL_FROM` is). Until it is, the code
   screen after sign-up is skipped and "Send me a code" answers "We can't send the code right now";
   no account can verify its email, so no real performer can start a search. Exact steps: W1
   (DNS records at name.com, Verify in Resend), W2 (API key into Vercel Production and Preview),
   W3 (webhook). Resume: `vercel env ls | grep RESEND_API_KEY`, redeploy, sign up with a new Test
   address on production, receive the code from contact@agental.co, enter it, check inbox or spam,
   then the banner path with an older unverified account. Tested so far: locally (code printed in
   the dev log), every step and error message.
17. **W17, Group 3: the full path on production (3.5).** The agent may not type a password on
   production or sign in with Google, and no code can reach anyone before W0, so the production run
   waits for you. Done instead: the whole path on localhost with fresh accounts (sign-up, code,
   questions, 100%, every message of 3.2 by putting the account in each state with
   `tools/db/local-search-states.mts`, the switch), screenshots in `docs/screenshots/r10/`; the first
   automatic search then 4 by hand is covered by `tests/api/search-slots-r8d.test.ts`. To run it
   together after W0: sign up on www.agental.co with a new address you control, enter the code,
   answer the questions, mark the account Test in Admin > Accounts, complete the profile, watch the
   first search queue, launch the 4 others; then the same with "Continue with Google" (needs the
   Google app published or your address added as a test user in Google Cloud > OAuth consent
   screen). Searches only run once n8n is connected (W8, W9, W11, W15).

## Round 9 (2026-11-22): start here

Brief: `Agental_Cowork_Round9_Prompt.md` (Desktop). The founder is away: the agent never waits.
Anything that needs him goes in "Waiting for Jérôme" below; when he writes "Here I am, I can
allow everything now", go through that list in order and finish each item.

Live before round 9: Version 48. Production stays in test mode (`WORKFLOW_MODE` unset).

### Progress

| Group | State | Version |
|---|---|---|
| 1. Admin, simpler | live | 49 |
| 2. Emails (Resend) | part 1 live (list, Limelight confirmation, demo accounts Test); sending waits for W1 to W3 | 50 |
| 3. Staging and n8n | waiting for W8 (secrets), W9 (bypass), W11 (n8n sign-in), W15 (archived Beta V2) | |
| 4. Searches through n8n | app side built (cost per provider, ceiling, details, failed shown); n8n Direct Replies patched; live run waits for W8, W9, W11, W15 | 51 |
| 5. Samantha and Adrian | built and tested with the model faked; live injection tests wait for W10 | 52 |
| 6. Automatic emails | built (4 emails, unsubscribe, Controls approvals); sending waits for W1 to W3, W6, W16 and staff approval | 54 |
| 7. Direct Replies | drafts only in n8n, Admin > Replies to approve built; D3 prepared (W13) | 55 |
| 8. Texts (flag off) | built behind SMS_ENABLED (off); what is missing: "Group 8: texts" below | 56 |
| 9. Controls, GO_LIVE | pause switch, AI accounts page, docs/GO_LIVE.md | 57 |

### Next exact step (when the founder is back)

He writes "Here I am, I can allow everything now": go through "Waiting for Jérôme" in order. As each
item lands, check it (`vercel env ls`, `dig`, the file in `~/.config/agental/`), redeploy, and run
what it unblocks:
- W1 to W3: send and check every email of `docs/EMAILS.md` on production with a Test account
  (results in the last column), check Admin > Emails statuses. Admin > Controls: approve the
  categories he wants.
- W4: `curl -sI https://admin.agental.co`, admin-only and two-factor checks.
- W5, W6: Realtime bell on a Test account; first backup and daily cron in the Vercel logs.
- W8, W9, W11, W15: bind the `Agental app (staging)` credential and the bypass header on the five app
  nodes of Direct Replies (n8n API, workflow inactive), redeploy the staging preview and re-alias
  `agental-staging-agentalco.vercel.app`, check signed / unsigned requests on the three routes, run
  the provider test (`mode` = `providers`), then the casting search on staging with three fictional
  performers, then on production with Test accounts.
- W10: the seven live injection tests in `docs/ASSISTANT.md` on a Test account.
- W13: D3 with the founder.
- Main: `main` is not fast-forwarded to `frontend-redesign` (the founder's explicit OK is needed).

### Waiting for Jérôme

Each item: group, exact step, what is needed, and how to resume. Secrets are never typed by
the agent: the founder pastes them. Commands below generate a value straight to the clipboard.

1. **W1, Group 2: Resend domain.** resend.com > Domains > agental.co: copy each record it shows
   (TXT `resend._domainkey`, MX and TXT on `send`) into name.com > agental.co > DNS Records; keep
   the existing DMARC; click Verify in Resend. Resume: `dig +short TXT resend._domainkey.agental.co`
   returns a value, then the agent runs Group 2.
2. **W2, Group 2: Resend key and sender.** resend.com > API Keys > Create (Sending access, domain
   agental.co). vercel.com > agental > Settings > Environment Variables: `RESEND_API_KEY`
   (Production and Preview); edit `EMAIL_FROM` (Production) to `Agental <contact@agental.co>`.
   Resume: `vercel env ls | grep RESEND_API_KEY`, then redeploy and test every email in
   `docs/EMAILS.md` with a Test account.
3. **W3, Group 2: Resend webhook.** resend.com > Webhooks > Add endpoint
   `https://www.agental.co/api/webhooks/resend`, all email events; signing secret into Vercel as
   `RESEND_WEBHOOK_SECRET` (Production). Resume: redeploy, check statuses in Admin > Emails.
4. **W4, Group 2: admin subdomain.** name.com DNS: CNAME, host `admin`, answer
   `cname.vercel-dns.com`, TTL 300. Resume: `dig +short CNAME admin.agental.co`, then
   `curl -sI https://admin.agental.co` and the non-admin check.
5. **W5, Group 2: live bell.** Supabase > Project Settings > JWT Keys > Legacy JWT secret into
   Vercel `SUPABASE_JWT_SECRET`; API Keys > publishable key into `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (both Production). Resume: redeploy, trigger a notification on a Test account.
6. **W6, Groups 1, 2, 9: crons.** Terminal: `openssl rand -base64 32 | pbcopy`, paste into Vercel
   `CRON_SECRET` (Production). Turns on the daily backup (09:30 UTC), the AI spend check and the
   30-day purge of deleted accounts (14:00 UTC). Resume: redeploy; check the next cron run in
   Vercel > Deployments > Functions logs.
7. **W7, Group 2 (optional): AI accounts card.** `OPENAI_ADMIN_KEY` (platform.openai.com >
   Settings > Admin keys) and `ANTHROPIC_ADMIN_KEY` (console.anthropic.com > Settings > Admin
   keys) in Vercel Production. Resume: redeploy, open /admin.
8. **W8, Group 3: n8n shared secrets.** Three values, each with `openssl rand -base64 32 | pbcopy`:
   - staging: Vercel `N8N_SHARED_SECRET`, Preview only; n8n > Credentials > Header Auth named
     `Agental app (staging)`, Name `Authorization`, Value `Bearer ` + the value;
   - production (Test accounts only): Vercel `N8N_SHARED_SECRET`, Production only; n8n Header Auth
     `Agental app (production)`, same form;
   - support: Vercel `N8N_SUPPORT_SECRET` (Preview and Production); n8n Header Auth
     `Agental support`.
   Resume: the agent binds the credentials on the HTTP nodes of both workflows (n8n API), checks
   the routes answer 401 unsigned and 200 signed.
9. **W9, Group 3: Preview bypass token.** Vercel > agental > Settings > Deployment Protection >
   Protection Bypass for Automation > Add, copy, then in Terminal:
   `printf 'VERCEL_BYPASS=%s\n' "$(pbpaste)" > ~/.config/agental/vercel-bypass.env && chmod 600 ~/.config/agental/vercel-bypass.env`.
   Resume: the agent fills the `x-vercel-protection-bypass` header on the app nodes and redeploys
   the staging preview.
10. **W10, Group 5: Anthropic key for the assistant.** First console.anthropic.com > Settings >
    Limits: monthly spend limit **$50** (proposed). Then API Keys > Create key `agental-assistant`
    into Vercel `ANTHROPIC_API_KEY` (Production and Preview). Resume: redeploy, run the injection
    tests on a Test account (`docs/ASSISTANT.md`).
11. **W11, Groups 3 and 4: n8n in the browser.** Sign in once to agental.app.n8n.cloud in the
    Claude app's browser pane so the agent can run "Execute workflow" (provider test: `mode` =
    `providers`). If the Gmail credential shows "Reconnect", click it and sign in as
    contact@agental.co. Proposed limits: OpenAI monthly budget $50 (platform.openai.com > Settings
    > Limits); Perplexity auto top-up off, balance about $20.
12. **W12: signed-in checks.** Sign in once to www.agental.co and admin.agental.co in the same
    browser pane (two-factor code). Resume: the agent clicks through the changed admin pages.
13. **W14, security (recommended): a demo account has the admin role.** The production build report
    lists two admins: contact@agental.co (two-factor on) and a `@demo.agental.co` account (two-factor
    off; it cannot open the admin without enrolling, since two-factor is required). DECISIONS says
    "Admin role: contact@agental.co only". Say "remove admin from the demo account" and the agent
    adds an audited migration that clears `isAdmin` on it.
14. **W16, Group 6: hourly automatic emails.** The agent's GitHub token cannot add workflow files
    (no `workflow` scope), so the schedule is in `docs/ops/hourly-notify.yml`. Either run once in
    Terminal `gh auth refresh -s workflow` (browser approval) and tell the agent "push the hourly
    workflow", or copy the file yourself to `.github/workflows/hourly-notify.yml` on GitHub (Add file
    > Create new file). Then GitHub > Agental1/Agental > Settings > Secrets and variables > Actions >
    New repository secret: name `CRON_SECRET`, value the same as in Vercel (W6). Then GitHub > Actions > "Hourly automatic emails" > Run workflow once to check (HTTP 200).
    Also: Admin > Controls > approve the email categories you want (none is approved).
15. **W15, Groups 3 and 4: which workflow is "Agental Beta V2"?** In n8n the app-connection
    workflow "Beta V2" (id `lKTl1S67ihlNz08C`) is **archived**; the API refuses to edit it. "Agental
    Beta V2 - Direct Replies" (id `p2Woctc1Xl0jL7fp`, inactive) contains the whole casting path
    too, already pointed at staging, so round 9 edits went there (backup of both in
    `~/Downloads/agental-workflows/n8n/backups/`). If "Beta V2" should be the casting workflow,
    unarchive it in n8n (Workflows > Archived > Beta V2 > Unarchive, leave it inactive) and say so:
    the agent applies the same patch to it (`n8n_g4.py`, kept in the scratchpad, logic in HANDOFF
    Group 4 notes).
16. **W13, Group 7: D3 email test (prepared; run by the founder).** Needs W2 (Resend key in
    Preview too), W8 (staging secret + the `Agental app (staging)` credential), W9 (bypass token) and
    an admin account on staging. Since round 9 the workflow only drafts: the reply goes out when you
    click Send in staging Admin > Replies to approve.
    1. From an address you control, email contact@agental.co: subject "Agental D3 test", one
       question (for example "How do the plans work?").
    2. n8n > "Agental Beta V2 - Direct Replies" > node "Incoming Gmail" > Fetch test event: note
       `threadId` and `id` (message id).
    3. Node "Beta Test Settings": `mode: 'inbox_test'`, `testTo: '<your address, lowercase>'`,
       `gmailThreadId: '<threadId>'`, `gmailMessageId: '<id>'`,
       `confirmSend: 'SEND TEST TO <your address, lowercase>'`. Execute workflow.
    4. Staging admin (https://agental-staging-agentalco.vercel.app/en/admin/reponses): the draft and
       your email are there. Click Send (or Edit then send).
    5. Check: exactly one reply in your mailbox, in the original thread ("Re: Agental D3 test"), and
       a copy in contact@agental.co. A second Execute with the same ids answers "existing" and creates
       nothing.
    6. Set `mode` back to `'providers'`; leave the workflow inactive and unpublished.

### Group 8: texts, what is missing before the first text

Built (round 9, off): the "roles found" text (Text or Both, consent, a US number, no STOP, at most
one a day, same staff approval and test-mode gates as the emails), STOP / START / HELP on
`/api/sms/inbound` with Twilio's signature checked, the opt-out recorded (`smsOptOutAt`), a log
without numbers or messages (`SmsLog`). To turn it on, in this order:
1. **Provider account:** Twilio (or tell the agent another provider). Create a Messaging Service.
2. **US carrier registration (A2P 10DLC):** in Twilio, register the brand (Agental's legal name,
   EIN, address, website) and a campaign ("account notifications", sample message: "Agental: your
   AI agent found new roles for you (3). See them: https://www.agental.co/... Reply STOP to opt
   out, HELP for help.", opt-in description: the unticked consent box in Settings with its text
   version `sms-roles-2026-11-22`). Approval takes days to weeks. Buy a number and add it to the
   Messaging Service once the campaign is approved.
3. **Keys in Vercel (Production):** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_MESSAGING_SERVICE_SID`.
4. **Inbound URL:** on the number, "A message comes in" webhook
   `https://www.agental.co/api/sms/inbound` (HTTP POST).
5. **The switch:** `SMS_ENABLED=true` in Vercel, redeploy, and approve "Roles found" in Admin >
   Controls. Test with a Test account first (test mode sends to Test accounts only).
`LAWYER:` the TCPA consent wording and the Privacy Policy line for texts.

## Round 8d (2026-11-22): start here

Live: Versions 45 (group 1), 46 (group 2), 47 (group 3), 48 (group 4); rows in `docs/RELEASES.md`.
Production stays in test mode (`WORKFLOW_MODE` unset).

### Done
- Group 1: height and weight in both units (cm and kg stored), the agent's saved name in Messages,
  the admin inbox and the bell, several conversations with delete for the performer only (kept for
  the team, Privacy Policy line), visible thread scrollbar and Jump to latest.
- Group 2: parallel search slots per plan (`searchSlots`, `searchSpacingHours` in `B2C_PLANS`), n8n
  claim honors the current plan's slots under a per-performer lock, honest queue copy, expected start
  per queued search. Quota reset on 2026-11-22: 16 accounts, 12 queued searches canceled, 12 rows
  kept (`User.searchQuotaResetAt`). The founder's account is Test (it was UNREVIEWED, which test mode
  refuses: that was the "AI searches are not available" message).
- Group 3: admin two-factor (TOTP) required in production (`/securite-admin`), sign-in limit inside
  the credentials check, Minors and Style guide pages check the admin role, media links 10 minutes,
  price-tampering tests. Answers in `docs/SECURITY.md` (round 8d check).
- Group 4: AI accounts card (admin dashboard), alerts to the admin bell and contact@agental.co.

### Waiting on the founders
1. **Enroll the admin authenticator now** (www.agental.co/en/admin redirects to the QR code). Until
   then the admin answers as for a non-admin. Lost phone: `ADMIN_MFA_REQUIRED=false` in Vercel, then
   delete the row in `AdminTotp` (docs/SECURITY.md).
2. **AI account keys (optional):** `OPENAI_ADMIN_KEY` and `ANTHROPIC_ADMIN_KEY` in Vercel Production.
   Neither provider offers a read-only or a balance key: both are organization admin keys (they can
   manage members and keys, not billing). Without them the card shows "Not connected" and works on
   typed balances. Perplexity: typed balance only.
3. **`CRON_SECRET`** (already pending since 8c) also turns on the daily AI spend check (14:00 UTC).
4. Earlier 8c items (Resend DNS and key, admin CNAME, Realtime keys) are unchanged.

### Round 9 carryover
- The first automatic search and the green button now work for Test accounts in test mode; a search
  stays "queued" until n8n is connected (no fake result is shown). The n8n claim already honors the
  plan's slots and the 6-hour gap per slot.
- `tools/db/round8d-report.mjs` (read-only build report) to remove once round 8d is read.
- Messages: the assistant does not yet introduce itself by the performer's chosen agent name (the
  name is shown by the UI only); the agents' prompts are round 9's.
- Account cleanup UI simplification (from 8c) still open.

## Round 8c (2026-11-22): start here

Live: Versions 40 (group A), 41 (group 1), 42 (group 4), 43 (group 6); rows in `docs/RELEASES.md`.
Production is in test mode (`WORKFLOW_MODE` unset). Package manager is now **pnpm** (see CLAUDE.md).

### Waiting on the founders (exact steps were sent in the round 8c conversation)

1. **Resend:** DNS records at name.com (DKIM `resend._domainkey`, MX and TXT on `send`, as Resend
   shows them; DMARC already exists), verify, then `RESEND_API_KEY` (Production and Preview),
   `EMAIL_FROM` = `Agental <contact@agental.co>`, webhook secret `RESEND_WEBHOOK_SECRET`.
   Unblocks group 2 (sign-up verification, password reset, USC code, email log statuses, the
   first automatic search check) and the deletion warning email.
2. **admin.agental.co:** CNAME `admin` -> `cname.vercel-dns.com` at name.com (the domain is
   already on the Vercel project). Unblocks group 3 (check HTTPS, admin-only on the server, a
   non-admin gets nothing).
3. **Supabase Realtime:** `SUPABASE_JWT_SECRET` (Project Settings > JWT Keys > Legacy JWT secret)
   and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (API Keys > publishable) in Vercel Production, then
   redeploy. The bell then updates live; until then it refreshes every 60 s.
4. **Backups:** `CRON_SECRET` in Vercel Production (any long random value, `openssl rand -base64
   32`), then redeploy. The daily backup then runs at 09:30 UTC (docs/BACKUPS.md). Also lets the
   Limelight retry drain run if a scheduler calls it.
5. **Group 5 go:** 8 accounts are eligible for deletion (list in the Version 42 build log,
   `[r8c-report] deletion`). 4 of them are the round 1 demo accounts `@demo.agental.co`
   (status Unreviewed, so the rule includes them): mark them Test in /admin/comptes if they
   should stay. Nothing is deleted without the founder's "go" in the conversation. The warning
   email needs Resend first and the founder's OK on its wording.
   Founder's decision (2026-11-22, in the conversation): keep the 4 demo accounts, delete the 4
   others. Since round 8c the cleanup page has a checkbox per account (none ticked by default):
   tick the ones to delete (none ticked by default), type `DELETE <number ticked>`. Admins can use it any time.
6. **Test account for group 2:** no production account is marked Test (all 22 Unreviewed), so
   the first automatic search (test mode) cannot be checked until one is: /admin/comptes > the
   founder's test account > status Test.
7. **Signed-in production checks:** the agent's browsers have no production session and it
   cannot type a real password. Sign in once in the Claude app's browser pane (www.agental.co and
   admin.agental.co) so the agent can click through the signed-in pages.
8. **Permission rules:** the auto mode classifier refused every edit of
   `.claude/settings.local.json`; the founder adds allow rules and `"dialogExpiry": "never"` by hand.

### Done and checked
- Group A: Preferences numbered 1 to 10; Build multi-select with chips; every Physical tile shows
  its value; Applications three buttons with counts, Get more details, then Accept/Decline.
  Checked locally (screenshots in docs/screenshots/r8c). Not checked signed in on production.
- Group 1: pnpm (Vercel builds with it; same direct dependency versions as bun.lock); flaky
  Limelight test skipped on a one-connection pool; relink prompt (6 cities, 1 phone on
  production); deep links focus City / phone / age range (headless check); media drag and drop
  by keyboard and by touch at 390 px pass (headless, local). Camera recording in Chrome and Safari
  not checked (no camera in the agent's browsers).
- Group 4: RLS audit (57 tables closed, docs/SECURITY.md), Realtime code and migration live but
  off, backup cron live but off (restore drill passed locally), search launch limit live.
- Group 6: docs/legal/TERMS_DRAFT.md; /talents/conditions 404 until `TERMS_PAGE_ENABLED=true`.

### Not done at the end of round 8c (2026-11-22)
- Group 2 (emails): blocked on Resend DNS + `RESEND_API_KEY` + `EMAIL_FROM` + `RESEND_WEBHOOK_SECRET`. No email sent, no inbox/spam result, first automatic search not checked (also needs an account marked Test).
- Group 3 (admin.agental.co): blocked on the CNAME `admin`. HTTPS, server-side admin check and the non-admin check not done.
- Realtime bell: code live, off until `SUPABASE_JWT_SECRET` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`; not tested on production.
- Daily backup: code live, off until `CRON_SECRET`; never run on production.
- Group 5: the founder deleted some of the eligible accounts himself on 2026-11-22 (Admin > Audit holds the entries); the warning email was never sent (needs Resend and his OK on the wording). He finds the cleanup interface still complicated: simplify in round 9.
- Signed-in production checks of every changed page, camera recording (Chrome, Safari): not done (no production session in the agent's browser; Google sign-in opens the regular browser and the cookie import did not carry the session).
- Permission rules and `dialogExpiry: never`: refused by the classifier; the founder edits `.claude/settings.local.json` himself.
- Cleanup: remove `tools/db/round8c-report.mjs` and its build step; `main` not fast-forwarded to `frontend-redesign` (needs the founder's explicit OK).

### Next exact step
When the founder says a founder action is done: re-run `vercel env ls` / `dig`, redeploy, and
finish its group (2, 3), then Realtime and backup checks on production (trigger a notification on
a test account; call nothing by hand on /api/cron/backup, wait for 09:30 UTC or ask the founder to
run the cron from Vercel > Settings > Cron Jobs). Remove `tools/db/round8c-report.mjs` and its
build step once group 5 is settled.

## Round 8c carryover

Round 8b (front-end polish, 2026-11-22) noted these back-end items for round 8c. Round 8c does not
cover n8n or the AI agents.

- **Package manager.** The round 8b brief says pnpm, but this repository has used bun since its
  first commit (`bun.lock` added in "Phase 0", no pnpm lockfile, no `packageManager` field, pnpm
  not installed on this Mac); Vercel installs with bun from `bun.lock`. Round 8b kept bun. Moving to
  pnpm (generate `pnpm-lock.yaml`, remove `bun.lock`, update CLAUDE.md and the deploy recipe) is a
  separate change to decide.
- **Flaky test**: `limelight-leads` "two drains at the same moment send one alert once" sometimes
  fails in the full local run (pg adapter "bind message supplies N parameters" error with the
  one-connection local database) and passes on its own. A running dev server on the same database
  makes it, and `role-search`, fail more often: stop it before `vitest`. Give the two drains their
  own connections or skip the concurrency case when the pool has one connection.
- **USC codes need the Resend key.** The code email goes through the existing Resend path. Until
  `RESEND_API_KEY` (and `EMAIL_FROM`) are set in Vercel Production, the USC step answers "We can't
  send the code right now. Try again later." and logs `[promo] USC code not sent`. Where to paste
  it: resend.com > API Keys > Create API key (Sending access, domain agental.co) > copy >
  vercel.com > agental > Settings > Environment Variables > Add `RESEND_API_KEY`, Production >
  Save > redeploy (same as section 1 of the Round 9 carryover).
- **Plan choices are recorded but not listed for staff.** `PlanChoice` (plan, price in cents,
  promotion, date, user) has no admin view yet; add one to /admin (CSV) so the team can write when
  payments open. One row per user, plan, price and promotion a day.
- **The Limelight USC gate is in the app only.** The public Limelight page has no account, so a
  request there with the promotion is recorded "not verified" in the lead's note.
- **Old student email route.** The "College student? Verify your school email" card was removed
  from the app (round 8b, Promotions covers it). `/etudiant` still confirms links already sent, and
  `requestStudentEmail` is no longer reachable from the UI; remove it once round 8b group 4 (USC
  code verification) is live.

## Round 9 carryover

State at hand-off: production runs v0.5.8.0 (`agental-leyymorx4`, tag `live-2026-11-22-r7b-admin`;
rollback `vercel promote agental-oxx0e06y2-agentalco.vercel.app`). `main` = `frontend-redesign` =
82a5e22 and later docs commits; no pull request open; no uncommitted change. Round 8 (front end)
runs in its own session before round 9.

### 1. What needs the owner (exact clicks)

- Resend key: resend.com > Domains > agental.co must say "Verified" (else add the DNS records it lists at name.com, then Verify) > API Keys > Create API key (Sending access, domain agental.co) > copy > vercel.com > agental > Settings > Environment Variables > Add `RESEND_API_KEY`, Production only > Save > tell the agent "redeploy".
- Resend delivery webhook: resend.com > Webhooks > Add endpoint `https://www.agental.co/api/webhooks/resend`, events sent, delivered, delivery_delayed, bounced, complained, failed > copy the signing secret > Vercel > Environment Variables > `RESEND_WEBHOOK_SECRET`, Production > tell the agent "redeploy".
- Admin CNAME: name.com > agental.co > DNS Records > Add: type CNAME, host `admin`, answer `cname.vercel-dns.com`, TTL 300 > Save; then open https://admin.agental.co and sign in as contact@agental.co.
- Google sign-in on admin (optional): console.cloud.google.com > project agental-515217 > APIs & Services > Credentials > "Agental website" > Authorized redirect URIs > Add `https://admin.agental.co/api/auth/callback/google` > Save.
- Deletion go: sign in as contact@agental.co > /en/admin/suppression > read `docs/ACCOUNT_DELETION_PROPOSAL.md` > "Export the list (CSV)" > (recommended) "Send the warning email" once Resend works, wait 7 days > type `DELETE <count>` > "Delete <count> accounts". Nothing has been deleted.
- Automatic searches for paid plans: decide the monthly number for Pro, Premium, Ultimate (`TODO(founders)`, `autoSearches` in `src/domain/pricing.ts`); Basic is 1 of 5.
- Before `WORKFLOW_MODE=live`: /en/admin/comptes > select junk accounts > status "Spam" > Apply (eligibility is now automatic, no approval step).
- Part D, database: confirm Vercel Preview's `DATABASE_URL` is the agental-dev database (or put its URL in `~/.config/agental/dev-db.env` as `DEV_DATABASE_URL=...` and tell the agent to run the migrations there).
- Part D, shared secret: Terminal `openssl rand -base64 32` > Vercel > Environment Variables > `N8N_SHARED_SECRET`, Preview only > n8n > Credentials > Create > Header Auth: name `Agental app (staging)`, Name `Authorization`, Value `Bearer <same value>` > tell the agent the credential name (it binds the five app nodes).
- Part D, bypass token: Vercel > agental > Settings > Deployment Protection > Protection Bypass for Automation > Add > copy > save it in `~/.config/agental/vercel-bypass.env` as `VERCEL_BYPASS=...` > tell the agent (it fills the five nodes and redeploys the staging preview).
- Part D, provider test: Chrome > agental.app.n8n.cloud > "Agental Beta V2 - Direct Replies" > Execute workflow (mode is already `providers`) > the four Probe nodes must be green.
- Part D, D3 email test: send an email from your own address to the team Gmail > in "Beta Test Settings" set `mode: 'inbox_test'`, `testTo`, `gmailThreadId`, `gmailMessageId`, `confirmSend: 'SEND TEST TO <your address>'` > Execute > check the reply in the same thread and one `inbox_replies` row (details in "Round 7b", Part D) > set `mode` back to `'providers'`.
- Limelight alerts: Vercel Production `LIMELIGHT_ALERT_EMAIL` (who receives new Limelight requests) and `CRON_SECRET` (retry cron); alerts stay Pending until set, and need the Resend key.
- Legal: a Terms of Service page does not exist; the deletion clause and the Privacy Policy line in `docs/ACCOUNT_DELETION_PROPOSAL.md` need counsel.

### 2. Built but not verified

- Signed-in pages on production (dashboard block, avatar menu, Settings, Media categories, role response, admin views): checked only locally; the agent's browser has no production session.
- Camera recording: self-tape Download button and recording into a role's video slot (no camera in the agent's browser).
- Deep-link cursor: `?focus=` puts the cursor in the field (links and targets verified; focus itself not, the agent's browser had no window focus).
- Verification email, password reset email, deletion warning, Limelight alert: code tested; no real email sent (no Resend key).
- Resend webhook and the email log statuses on production (no secret yet).
- admin.agental.co on production (no DNS record yet); tested on admin.localhost.
- n8n: provider test and D3 not run; staging preview answers 302 until the bypass token exists; the casting workflow "Beta V2" (id `lKTl1S67ihlNz08C`) was not touched in round 7.
- The first automatic AI search on production: production is in test mode, so it only starts for accounts marked Test.

### 3. Partial or fragile

- PR #4 (Free plan terms from `B2C_PLANS` in onboarding, still valid) and PR #5 (deals dashboard, unfinished) were closed unmerged; branches `fix/commission-from-pricing` and `feat/deals-dashboard` are kept.
- Old HEIC photos uploaded before round 7b stay HEIC: Chrome shows "No preview in this browser"; a re-upload fixes them.
- The staging alias `agental-staging-agentalco.vercel.app` points at one fixed preview (`agental-dq9cit51c`); every env change on Preview needs a new `vercel deploy` and `vercel alias set`.
- Admin pages still answer on www too (role checked on the server); the admin host only narrows what admin.agental.co serves; API routes are not host-restricted.
- Admin lists load at most 2000 rows (a note says so); the email log keeps 180 days (purged when staff open Emails, no cron).
- Six-hour automatic searches now count in the automatic cap on Basic (1 per period, the first automatic search included).
- A running dev server corrupts `.next` (see CLAUDE.md, Tooling); stop it and delete `.next` before typecheck or build.
- Local test runs leave `test-*` rows in the local database (local only).

### 6. From round 8c (2026-11-22)

- The bell's Realtime token is a real `authenticated` token for every Supabase API; keep Storage
  and app tables closed to `authenticated` (docs/SECURITY.md).
- Backups live in the same Supabase project; an off-project copy is a founder decision. A failed
  backup only shows as a failed cron invocation: add an alert or the last backup date on the
  admin hub.
- The Limelight real-database race test needs a pooled database (no CI exists).
- n8n or agents writing `Notification` rows get the Realtime signal automatically (trigger).

### 5. From round 8b (2026-11-22)

- **AI agent setup** is saved on `ArtistProfile` (`agentNameChoice` samantha | adrian | custom,
  `agentCustomName`, `agentHelps` as a JSON array of roles | profile | selftape | draft,
  `agentSavedAt`). Nothing reads it yet; the agent built in round 9 should use these choices.
- **"I don't do any accents"** is stored as the single value `none` in `physical.accents`
  (`NO_ACCENTS` in `src/domain/accents.ts`); matching and briefs must skip it.

### 4. From round 8 (2026-11-22)

- **SMS for roles found** needs a provider (for example Twilio), an API key the owner pastes in
  Vercel, and US carrier registration (10DLC brand and campaign) before the first text. The
  choice and the consent (text version `sms-roles-2026-11-22`, date) are already stored on
  `ArtistProfile` (`roleAlertChannel`, `smsConsentAt`, `smsConsentVersion`). Nothing sends today.
- **Verification emails** (the 100% message's "Resend the email" link) still wait on
  `RESEND_API_KEY` (section 1).
- **Bell refresh**: polling every 60 s. Supabase Realtime would need Supabase Auth sessions or a
  signed channel; this app uses its own sessions.
- **Triggers and n8n**: the notification trigger functions are not SECURITY DEFINER. If n8n ever
  writes `ApplicationDraft` or `Message` rows directly with a restricted database role, that role
  needs INSERT on `Notification`. Today n8n goes through the app's routes (owner role).
- **Automatic searches for paid plans** (`autoSearches`, TODO(founders)) are unchanged; the
  locked-search dialog says "4 more" on Basic from the plan allowance minus one.
- **Media drag and drop**: mouse and keyboard paths were checked locally in the preview pane;
  touch was not tested on a real phone.
- **Signed-in pages on production** were not clicked through (no production session in the
  agent's browser); all checks ran on localhost with the local database.
- 6 free-text cities and 1 phone number could not be linked automatically; they show "pick it
  from the list" until the performer edits them.

## Round 7b (2026-11-22): start here

Brief: owner's `Agental_Cowork_Round7b_Prompt.md` (Desktop). All four groups are live:

| Group | Version | Deployment | Tag | Rollback |
|---|---|---|---|---|
| 1 and 2 | v0.5.5.2 (PR #14) | `agental-8i3fiytoc` | `live-2026-11-22-r7b-g2` | `vercel promote agental-h6k87gtud-agentalco.vercel.app` |
| 3 | v0.5.6.0 (PR #15) | `agental-hlgnsxkcv` | `live-2026-11-22-r7b-g3` | `vercel promote agental-8i3fiytoc-agentalco.vercel.app` |
| 4 | v0.5.7.0 (PR #16) | `agental-oxx0e06y2` | `live-2026-11-22-r7b-g4` | `vercel promote agental-hlgnsxkcv-agentalco.vercel.app` |
| Admin site | v0.5.8.0 (PR #17) | `agental-leyymorx4` | `live-2026-11-22-r7b-admin` | `vercel promote agental-oxx0e06y2-agentalco.vercel.app` |

Root cause 2.2: the dashboard "Create your website" card opened the public Limelight page, which is
pre-rendered and always shows "Sign in", so the person looked signed out (the session was intact).
The card now opens Website in the app, which has the request form when no site exists.

### What waits on the owner (in this order)

1. **Resend (3.1, verification emails).** Production has `EMAIL_FROM` and
   `EMAIL_VERIFICATION_REQUIRED_SINCE` but **no `RESEND_API_KEY`**, so every email is only logged.
   In Resend: Domains, check agental.co is "Verified" (if not, add the DNS records Resend lists at
   name.com, then "Verify"). API Keys, "Create API key", permission "Sending access", domain
   agental.co. In Vercel, project agental, Settings, Environment Variables, add `RESEND_API_KEY`
   for Production only, paste the key, save, then tell the agent "redeploy": it redeploys and
   checks a sign-up email end to end. `EMAIL_FROM` must be an address on agental.co
   (e.g. `Agental <hello@agental.co>`). Optional: `NEXT_PUBLIC_SITE_URL=https://www.agental.co`
   in Production (email links work without it, from the request host).
2. **Account deletion (3.3): your go.** Nothing has been deleted. Sign in as contact@agental.co,
   open `/en/admin/suppression`: the list, "Export the list (CSV)", the optional warning email
   (disabled until Resend works), and "Delete all eligible" (type `DELETE <count>`). Rule: email
   never verified, created more than 7 days ago, never paid, in no organization, not staff, test or
   approved, not warned in the last 7 days. Read `docs/ACCOUNT_DELETION_PROPOSAL.md` first (no Terms
   of Service page exists; privacy wording to add; lawyer points). Recommended: send the warning,
   wait 7 days, then delete. The agent could not list production candidates (no production DB
   access from this Mac), so the list is only on that page.
3. **Automatic searches for paid plans (4.1).** `TODO(founders)` in `src/domain/pricing.ts`
   (`autoSearches` for Pro, Premium, Ultimate; Basic is 1). Until set, paid plans have no separate
   automatic cap.
4. **Before switching `WORKFLOW_MODE=live`:** eligibility is now automatic (verified email + 100%
   profile, no approval). Mark junk accounts Spam first, and consider a daily cap on searches.
5. **Part D, see below:** the n8n shared secret, the Vercel bypass token, the provider test click,
   then D3.

### Part D: "Agental Beta V2 - Direct Replies" (set up, waiting for the owner)

The workflow already existed in n8n: **"Agental Beta V2 - Direct Replies"**, id `p2Woctc1Xl0jL7fp`
(the link the owner gave). It stays **inactive and unpublished**. No other workflow was touched.
A copy from before the setup is in `~/Downloads/agental-workflows/n8n/agental-pilot/`
("Direct Replies - before Part D setup ….json"). The n8n API key is in `~/.config/agental/n8n.env`
(outside the repo, mode 600).

Done by the agent (n8n API):
- Saved credentials bound on 14 nodes: "OpenAI account" (Luna nodes, Probe OpenAI), "Perplexity
  account" (search, context, retries, probes), "Gmail account" (Incoming Gmail trigger, thread
  reads, send, probe).
- The five app calls now point at staging: `https://agental-staging-agentalco.vercel.app/api/n8n/`
  `casting/claim`, `casting/complete`, `inbox/claim`, `inbox/complete`, `inbox/review`. Each sends
  a header `x-vercel-protection-bypass: PASTE_VERCEL_BYPASS_TOKEN` (placeholder).
- "Beta Test Settings" is set to `mode: 'providers'` (checks the providers, sends nothing).
- Staging: preview `agental-dq9cit51c` from `frontend-redesign`, aliased to
  `agental-staging-agentalco.vercel.app`. It answers 302 today: Vercel deployment protection.

Owner steps:
1. **Confirm Vercel Preview uses the agental-dev database**, and that it has every migration
   (previews run none). If unsure, tell the agent and give it the dev database URL in
   `~/.config/agental/dev-db.env` (`DEV_DATABASE_URL=...`): it runs `prisma migrate deploy` there.
2. **Shared secret.** Terminal: `openssl rand -base64 32`. Vercel, Settings, Environment Variables:
   `N8N_SHARED_SECRET` = that value, **Preview only** (never Production during Part D). n8n,
   Credentials, Create, "Header Auth": name `Agental app (staging)`, Name `Authorization`, Value
   `Bearer <the same value>`. Then in the workflow open the five HTTP nodes above (Claim Opted-In
   Profiles, Record Scheduled Results, Claim Reply for This Message, Save Reply Receipt and Review
   Flag, Queue Inbox Review) and pick that credential (or tell the agent its name: it binds them).
3. **Bypass token.** Vercel, project agental, Settings, Deployment Protection, "Protection Bypass
   for Automation", Add, copy it. Either paste it in place of `PASTE_VERCEL_BYPASS_TOKEN` in the five
   nodes, or save it in `~/.config/agental/vercel-bypass.env` (`VERCEL_BYPASS=...`) and tell the
   agent. Then the agent redeploys the preview (env changes need a new build) and re-aliases it.
4. **Provider test (one click).** Open the workflow in Chrome, "Execute workflow" (manual trigger,
   mode `providers`). Expected: Probe OpenAI Luna, Probe Perplexity Search, Probe Perplexity
   Context and Probe Gmail Account Access green; nothing is sent.
5. **D3, the email test (owner only).** From an address you control, email the team Gmail
   mailbox ("Agental D3 test"). In Gmail, open it and copy the thread id and message id (the n8n
   "Incoming Gmail" node, "Fetch test event", shows both). In "Beta Test Settings" set:
   `mode: 'inbox_test'`, `testTo: '<your address, lowercase>'`, `gmailThreadId`, `gmailMessageId`,
   `confirmSend: 'SEND TEST TO <your address, lowercase>'`. Execute. Expected:
   - one reply in the same Gmail thread, to your address only;
   - in the staging database, one `inbox_replies` row for that thread and message, status
     `sent` (or `review` if it asked for a human), with `claimId` and `sentMessageId` set;
   - if the workflow flags it, the thread appears in staging Admin, Messages, "Waiting for the
     Agental team".
   A second execution with the same ids answers "existing" and sends nothing.
   Then set `mode` back to `'providers'`.

### Admin site at admin.agental.co (live, waiting for DNS)

Live in v0.5.8.0: on admin.agental.co only the admin pages and sign-in answer ("/" opens the hub,
everything else 404); new pages Profiles (`/admin/profils`), Media (`/admin/medias`), Emails
(`/admin/emails`), Audit with search, each with CSV; every email the app sends is logged
(recipient, subject, kind, status; 180 days; removed with a deleted account). The domain is
assigned to the Vercel project. Owner steps:
1. **DNS at name.com:** record `CNAME`, host `admin`, value `cname.vercel-dns.com`. Then
   `https://admin.agental.co` opens the hub (sign in as contact@agental.co; sessions are per host,
   so sign in once there).
2. **Google sign-in on the admin host (optional):** Google Cloud, project agental-515217, the
   "Agental website" client, add the redirect URI
   `https://admin.agental.co/api/auth/callback/google`. Email sign-in works without it.
3. **Delivery statuses:** Resend, Webhooks, Add endpoint `https://www.agental.co/api/webhooks/resend`,
   events email.sent, delivered, delivery_delayed, bounced, complained, failed. Copy its signing
   secret into Vercel Production as `RESEND_WEBHOOK_SECRET`, then ask the agent to redeploy.
The admin pages still also answer on www (the role is checked on the server either way).

### Not checked

Signed-in production pages (no production session in the agent's browser); the self-tape
Download button and recording into a role's video slot (no camera in the agent's browser); deep
link focus (the agent's browser has no window focus).

## Round 7 (2026-11-21): start here

Brief: owner's `Agental_Cowork_Round7_Prompt.md` (Desktop). Plan: `docs/ROUND7_PLAN.md`. n8n
contract: `docs/N8N_LINK.md`. Limelight: `docs/LIMELIGHT_TRACE.md`. Founders' answers
(admin = contact@agental.co only, test mode kept, archive only): `docs/DECISIONS.md`.

### Live since 2026-11-21: v0.5.5.0

PR Agental1/Agental#13, squash `2f492d4` on `frontend-redesign`, deployment
`agental-h6k87gtud-agentalco.vercel.app`, tag `live-2026-11-21-r7`. Rollback:
`vercel promote agental-82c7l3r32-agentalco.vercel.app`. Parts B and C, with the Part A
portal they depend on (account status, Agents gate, waiting view, jobs, revenue). The build
applied three additive migrations (`20261128000000_account_status`, `..._search_claim`,
`..._inbox_replies`).

Checked on production (signed out): pages load; the Limelight form sends
`source=limelight-page`; `/en/admin` and Applications redirect to sign-in; all five
`/api/n8n/*` routes answer 404 (no `N8N_SHARED_SECRET` in Production; fail closed is also
tested in `tests/api/n8n-fail-closed.test.ts`). `WORKFLOW_MODE`, `AGENTAL_FIND_STAGING` and
`ADMIN_EMAILS` are not set in Production: test mode, only Test accounts can start a search.
Not checked: the signed-in admin pages on production (needs the admin account below).

**Owner, first: grant admin (the agent could not reach the production database).** Supabase,
project agental, SQL editor:

```sql
-- 1. Who has the flag today
SELECT id, email, "accountStatus" FROM "User" WHERE "isAdmin" = true ORDER BY email;
-- 2. Grant it to contact@agental.co only
UPDATE "User" SET "isAdmin" = true WHERE lower(email) = 'contact@agental.co';
-- 3. Optional: clear it from anyone else listed in 1 (the code already refuses them)
UPDATE "User" SET "isAdmin" = false WHERE "isAdmin" = true AND lower(email) <> 'contact@agental.co';
```

Then sign in as contact@agental.co on www.agental.co and open `/en/admin`: the hub, Accounts
(totals, statuses), Messages (waiting tab), Applications and AI jobs, Revenue, Limelight.

### Next 1: Part D, "Beta V2 - Direct Replies" (not started)

Needs from the owner first: an n8n API key in `~/.config/agental/n8n.env`; confirmation that
Vercel Preview uses the agental-dev database; `N8N_SHARED_SECRET` (random, at least 24
characters, `openssl rand -base64 32`) pasted in Vercel Preview only, and the same value in an
n8n Header Auth credential (name `Authorization`, value `Bearer <secret>`); a Vercel protection
bypass token for the preview; the names of the saved OpenAI, Perplexity and Gmail credentials
and the Gmail mailbox. Never set the secret in Production during Part D.

1. Deploy `frontend-redesign` as a preview (`vercel deploy`, no `--prod`); previews run no
   migrations, so the dev database must already have the three round 7 migrations
   (`bun --bun run prisma migrate deploy` against it, owner confirms the database first).
2. Import `n8n/agental-pilot/Beta V2 - Direct Replies.json` (outside the repo) as a new,
   inactive, unpublished workflow. No other workflow is used, copied or edited.
3. Point its five backend URLs at `<preview>/api/n8n/...` (casting claim and complete, inbox
   claim, complete, review), with the bypass token; set every HTTP node to the Header Auth
   credential; bind the saved OpenAI, Perplexity and Gmail credentials.
4. Provider test: run with `mode: providers` only. Check each provider answers; nothing sent.
5. Prepare D3 (exact input, expected rows in `inbox_replies`, what the owner clicks), write it
   here, and stop: the owner runs D3.

### Next 2: Part A addition, the admin site at admin.agental.co (not started)

Same codebase and database; only contact@agental.co as admin; every page checks the role on the
server; read-only except account status, waiting replies and Limelight follow-up; no secret
ever displayed. In order:
1. Host routing in `src/proxy.ts`: on `admin.agental.co` (and `admin.localhost` locally), `/`
   redirects to `/en/admin`; allow `/{locale}/admin/**`, `/{locale}/connexion`, `/api/auth/**`,
   `/api/admin/**`, `/api/media/**`, `/api/avatar/**`, static assets; everything else 404.
   Sessions are per host: email sign-in works there; Google needs the redirect URI
   `https://admin.agental.co/api/auth/callback/google` (owner, Google Cloud) and a check of
   `AUTH_URL` (www today).
2. Data views with search, filters and CSV: profiles (`/admin/profils`), media
   (`/admin/medias`, opened only through `/api/media/<id>`), audit log (search and CSV added);
   accounts, searches, applications, messages and Limelight exist.
3. Email log: additive `EmailLog` table (to, subject, kind, resendId, status queued, sent,
   delivered, bounced, failed, timestamps); record in `sendEmail` (`src/lib/mailer.ts`);
   `POST /api/webhooks/resend` checks the Svix signature with `RESEND_WEBHOOK_SECRET` (owner
   pastes it from Resend, Webhooks, into Vercel Production); page `/admin/emails`.
4. Domain: `vercel domains add admin.agental.co` (owner approval), then the CNAME `admin` to
   `cname.vercel-dns.com` at name.com.
5. `/review` and `/qa`, then report "Part A is ready to deploy"; deploy only on the owner's
   "deploy".

### Still open from round 7

- Limelight alerts stay Pending until `RESEND_API_KEY` and `LIMELIGHT_ALERT_EMAIL` are set in
  Vercel Production (`CRON_SECRET` too, for the retry cron).
- Run tests with Node (`~/Downloads/agental-workflows/.tools/node/bin`), not `bunx vitest`:
  Bun keeps the CSV byte-order mark and two Limelight CSV tests fail under it.
- Remote Control and `.claude/settings.local.json` allow rules were refused by auto mode.

## Round 6 closeout and Part 2 (2026-11-21)

**Live now:** v0.5.4.0, Part 2 (PR #12, merge `347340c`, tag `live-2026-11-21-r6-p2`, deployment `agental-82c7l3r32`). Rollback: `vercel promote agental-4p7r3jjg8-agentalco.vercel.app` (the closeout). Checked after deploy: public pages, pricing ($0, $19, $49, $79, no raw placeholders), FAQ, auth endpoints and the storage health route answer normally. Not checked: signed-in pages (no session in the browser pane), so the save message, delete dialog and phone menu still need one look on production.

**Rule for every session and every subagent brief:** tests and builds run with `DATABASE_URL` and `DIRECT_URL` set to the local database (`postgres://postgres:postgres@localhost:51234/template1?sslmode=disable`, `DATABASE_POOL_MAX=1`). Plain `bun run test` reads `.env`, which points at the production pooler. On 2026-11-21 a review subagent did that; the pooler refused every login, so no data was touched. Put this rule in every brief you hand to a subagent.

Read `docs/DECISIONS.md` first.

1. **Live:** the closeout shipped as v0.5.3.0 (PR #11, tag `live-2026-11-21-r6-closeout`, deployment `agental-4p7r3jjg8`). It contains: Talent pricing restored (Premium $49, Ultimate $79, 5% commission), figures only in `src/domain/pricing.ts` with `{price}`, `{commission}`, `{searches}` tokens in the copy (`src/lib/plan-price.ts`); root `CLAUDE.md`; `docs/DECISIONS.md` with "Differences found" (Casting $99/$299 vs deck $95/$295, "per month" wording vs rolling 30 days, email link vs code, Limelight figures in copy, Apple, R2 fallback).
2. **Live (v0.5.4.0):** branch `round6-part2-v2` (Part 2 replayed onto the live `frontend-redesign`): shadcn/ui in the signed-in app. `components.json` by hand (no `init`), shadcn names mapped to our roles in `@theme inline`, `dark:` = Casting theme. Toasts, Button `loading`/`destructive`, Sheet phone menu, Select, Switch, Progress, page skeletons (`loading.tsx` for talents app, casting app, admin), `IconTip` tooltips, AlertDialog in place of `window.confirm`. Not yet done in Part 2: before/after screenshots per page (the browser pane was hidden), Casting pages not clicked through, native selects left in `height-field.tsx`, `lead-status-select.tsx` and admin filters (they submit GET forms). Known trade-off (owner decision, 2026-11-20): the `loading.tsx` skeletons stream app pages, so a `notFound()` there answers HTTP 200 with the not-found screen and noindex, and page-level `redirect()` happens in the browser; signed-in pages are not indexed.

Local checks for both: typecheck, lint, i18n parity, 2186 tests (`npx vitest run --no-file-parallelism` on the local DB), `bun run build` on the local DB.

### Exact next steps
1. **R2 copy (needs the owner at the Mac).** Aside is not installed, so gstack `/browse` falls back to its headless browser, which needs the owner's cookies: run `/setup-browser-cookies` for `www.agental.co` only (the owner picks the Chrome profile, there are 12, and approves Keychain). Then open `https://www.agental.co/api/admin/storage/copy`, check `complete: true` and `fitsFreePlan: true`; stop and report if false. Then `?copy=1` until `left` is 0, re-run the dry run, compare counts. Then the R2-removal change (items 1 to 9 in `shared-notes/ROUND6_CARRYOVER.md`, outside the repo). The video and photo test stays with the owner.
2. **Part 3** (plan in the round 6 plan, "Part 3"): first sign-in lands on Profile completeness (DECISIONS: Product rules); admin hub columns (sign-up method, media count, website status); clean wordmark SVG; Turnstile waits for its two keys; Google sign-in needs the owner (Testing mode); Limelight own address needs the owner's choice (`name.agental.site`, a subdomain, or keep `/s/<name>`).
3. **Part 4** (email codes): additive `EmailCode` table, HMAC with `AUTH_SECRET`, 10 minutes, 5 attempts, 60 s resend, 5 per hour; sign-up six-box screen; forgot-password code then a 15-minute grant cookie; `sessionsValidAfter` on reset; DNS records at name.com for Resend; the owner pastes `RESEND_API_KEY`.

Gstack prompts skipped while the owner was away: CLAUDE.md skill routing injection (twice). Mobile push is off in the owner's Claude settings, so push notifications did not arrive.

## Where things stand

| | |
|---|---|
| Repository | `Agental1/Agental` (public: no secrets, no `docs/PLAN.md`) |
| Working branch | `frontend-redesign`, pull request #7, stacked on #2. It contains the backend branches `feat/auth-onboarding` (#6), `feat/round2-server` (#8) and `feat/beta-server` (#9, merged in `47670fe`). |
| Live site | agental.co runs release 2: tag `live-2026-11-19-release2` (`bff6edb`), deployment `agental-exmsrxj64-agentalco.vercel.app`. Previous: release 1, `agental-2bj1oiw9g-agentalco.vercel.app`. |
| Going back | `docs/RELEASES.md`: one tag and one deployment per live version; `vercel promote <deployment>` puts an older one back |
| Deploying | `vercel deploy --prod` from this Mac (the GitHub link to Vercel is not approved). The build applies pending Prisma migrations to production. After a deploy: tag, push the tag, add a row to `docs/RELEASES.md`. |
| Local run | Node and bun in `~/Downloads/agental-workflows/.tools`. Database: `./node_modules/.bin/prisma dev start agental-local`. Dev server: launch config `agental-site-db` (port 3200). Seed logins are in the README, local only. If a nested page answers 404 in dev, restart the server. |
| Checks | `bun run typecheck`, `bun run lint`, `bun run i18n:check`, `bun run test` (with the local `DATABASE_URL` for the database test), `bun run build` |
| Two sessions | A front-end session (this branch) and a backend session (its own worktree `Agental-backend`). Shared notes: `~/Downloads/agental-workflows/shared-notes/`. |

Briefs, on the owner's Desktop: `Agental_Cowork_Frontend_Prompt.md` (v1), `Agental_Cowork_Round2_Prompt.md` (round 2), `Agental_Claude_Cowork_Prompt.md` (beta brief, six tasks, in progress).

Rules from the owner: design is approved, keep it; every amount in US dollars; American English, no em dashes; keep a rollback point for every live version; Apple sign-in is set aside for now.

## Beta brief: state by task

| Task | State | Evidence or next action |
|---|---|---|
| 1. Finish in-progress work | partial | Open items: see "Open items" below. |
| 1. Beta notices | done, local | Footer under the legal links (every public page), About page, Limelight hero. Flags in `src/data/beta.ts`, copy in `common.beta`. Not deployed yet. |
| 2. Google sign-in | button live, sign-in blocked by Testing mode | Google Cloud project `agental-515217` (organization agental.co): consent configuration (app name Agental, External audience, contact@agental.co) and Web client "Agental website" (origin `https://www.agental.co`, redirects `https://www.agental.co/api/auth/callback/google` and `http://localhost:3200/api/auth/callback/google`). `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are saved in Vercel for Production (the owner pasted the secret). Redeployed 2026-11-19 (`agental-o7qjzmknb`, tag `live-2026-11-19-google`): `/api/auth/providers` lists google, both sign-in pages reach Google's account screen with redirect `https://www.agental.co/api/auth/callback/google` (agental.co 308s to www). Round trip not done: the app is in Testing with 0 test users, and Publish is blocked until Branding has a privacy-policy URL. Parked as Group 6 of round 3. The Google app stays in Testing (only listed test users can sign in) until the site has a privacy-policy page to give Google. |
| 3. Media and connected accounts | partial | Settings > Connected accounts is built in both apps. Reel & Self-tape records, reviews and uploads to private storage with a destination choice. To do: Profile > Media sections (Headshots, Reel/Voice, Self-tapes), share and revoke, attach to a draft, delete across storage, the two-identity access test. |
| 4. Workflows | not started here | Backend session. n8n exports are in `~/Downloads/agental-workflows/` and `n8n/`. Nothing live is connected. |
| 5. One-performer calibration | not started | Backend session, with a synthetic performer. |
| 6. Limelight | partial | Page, templates, Try it, Your website (save, mock purchase, publish) exist. To do: review of #2 at four widths, `POST /api/limelight/interest` with persistence and outbox, the "Request a portfolio site" form, serving a published site by hostname, Axel's handoff. |

## Open items from the earlier briefs

- Verification and forgot-password emails: screens and server are built and checked locally (`/mot-de-passe-oublie`, `/reinitialiser`, `/verifier`). Not deployed. No email sender is configured, so emails are logged, not sent.
- Admin screens: student price requests, student codes, accounts index and timeline.
- Published Limelight sites are not served at `*.agental.site`.
- Recording was never tested with a real camera, on phones, or in Safari and Firefox.
- A sign-up and sign-in on production has not been done by either session.
- How it works, FAQ, About and casting-type pages keep their older layout.
- Existing copy still has em dashes and French-law wording ("governed by French law", "registered with the French authorities") that does not fit a U.S. beta. This is a copy and counsel decision.

## Owner-only actions

| Action | Where | Unblocks |
|---|---|---|
| Sign in to Google Cloud as contact@agental.co when asked | Chrome | Creating the Google sign-in client |
| Paste the Google client secret | Done 2026-11-19 | Google sign-in on the live site, after the next deploy |
| Privacy-policy page, then publish the Google app | Write the page (counsel), then Google Cloud > Audience > Publish | Google sign-in for everyone, beyond test users |
| Add the CORS rule from `docs/MEDIA_HOSTING.md` | Cloudflare > R2 > bucket `agental-media` > Settings | Video uploads on the live site |
| Resend API key and DNS records for agental.co | Resend, then Vercel variables | Verification and password-reset emails |
| Stripe keys, after counsel signs off | Vercel variables | Real payments |
| Student price for the $99 Limelight offer | Tell either session | The student line on the Limelight page |
| Commission wording on pricing | Decision | Pricing copy |

## Release boundary for the U.S. beta

Kept off or behind the mock: online payments, paid access to roles, automated submissions, live producer ranking. Active: self-managed profiles, private media, application drafts for human review. Adults only (date of birth required at sign-up, under-18s refused on the server).

## Next concrete task

Turn on Google sign-in: `vercel deploy --prod --yes`, then `curl https://www.agental.co/api/auth/providers` must list `google`; click "Continue with Google" on `/en/connexion` and `/fr/connexion` and confirm Google's account screen opens; tag `live-YYYY-MM-DD-google`, add the row to `docs/RELEASES.md`. Then the round trip with a test user: first login, return login, sign-out, cancel, protected route while signed out, mobile width. After that, Task 3's Profile > Media.

## AI role searches: contract for n8n (round 3, Group 3)

"Start finding roles" on the Talent dashboard writes one row per click to `public.role_search_requests` (Prisma model `RoleSearchRequest`). The app calls no workflow. Code: `src/lib/role-search.ts`, `src/domain/role-search.ts`, action `startFindingRoles` in `src/app/actions/role-search.ts`.

| Column | Meaning |
|---|---|
| `id` | cuid, the request id |
| `userId` | the performer (`User.id`) |
| `plan` | plan at click time: `FREE` (shown as Basic), `PRO`, `PREMIUM`, `ULTIMATE` |
| `periodKey`, `seq` | quota slot: `lifetime` for Basic, `YYYY-MM` (UTC) for monthly plans |
| `status` | `queued` (written by the app), then `running`, `done`, `failed` or `canceled` (written by the workflow) |
| `startedAt`, `completedAt` | set by the workflow |
| `error` | short reason when `failed`, no personal data |

Status contract for the workflow:
1. Claim a row atomically: `UPDATE role_search_requests SET status='running', "startedAt"=now(), "updatedAt"=now() WHERE id = (SELECT id FROM role_search_requests WHERE status='queued' ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *;`
2. Respect `User.workflowAccess` (only `ELIGIBLE` in live, `TEST` in staging). For any other value set `status='canceled'`.
3. Finish with `status='done'` and `completedAt`, or `status='failed'` with `error`. `failed` and `canceled` give the performer's search back; `queued`, `running` and `done` count against the quota.
4. Results go where applications already go (drafts for human review); nothing is submitted automatically.

Quotas (from `B2C_PLANS.*.aiSearches` in `src/domain/pricing.ts`): Basic 5, Pro 50, Premium 250, Ultimate 500. The server counts each allowance over a rolling 30-day period from the first search (`PERIOD_DAYS` in `src/domain/role-search.ts`). Quota check and insert share one transaction with a per-user advisory lock; a unique index on (`userId`, `periodKey`, `seq`) and one on (`userId`, `clientKey`) back it up. Access: RLS is on with no policy (the Data API sees nothing); the app shows a performer only their own rows and the full list at `/admin/recherches` to admins. The workflow should connect with a dedicated database role or through a signed app endpoint, never with the anon key.

## Round 3, Group 4 (2026-11-20): what is live and what waits on the owner

- **Self-tape save.** Root cause: the production bucket has no CORS rule, so the browser's direct upload to R2 is refused (preflight 403, see `GET /api/health/storage`, which reports `directUploads: true` once fixed). The save now keeps the take when it fails, says storage was unreachable, and on an expired session stores the take in the browser (IndexedDB), sends the person to sign-in with `?next=` and puts the take back on review. "You're not signed in" could not be reproduced without a production sign-in; the server answers it only with no session, a non-performer session or a minor's profile.
- **Owner action:** Cloudflare > R2 > `agental-media` > Settings > CORS Policy > Add the rule in `docs/MEDIA_HOSTING.md` (origins `https://www.agental.co` and `https://agental.co`, methods PUT and GET, header `content-type`). Then open `/api/health/storage`.
- **Email verification (4.1).** The gate exists (`src/domain/email-verification.ts`) but stays open in production: no `RESEND_API_KEY`/`EMAIL_FROM`, no `EMAIL_VERIFICATION_REQUIRED_SINCE`. New password accounts reach the app unverified until those three are set in Vercel Production. Not tested with a real inbox for that reason.
- **Student discount (4.2).** School email (`.edu`, list in `src/domain/student.ts`), link valid 48 h, one use, 3 sends per hour, one account per school address (`User.studentEmail` unique). Discount amount and Stripe coupon are `TODO(founders)`; billing is still the mock, so nothing is charged or discounted yet. Without an email sender, production says the request is saved instead of "check your inbox". The 6-digit code has no UI; its server code stays.
- **Profile picture (4.4).** Square 512 px JPEG cropped in the browser, sent through a server action (no direct upload, so it works without the CORS rule), stored at `{userId}/avatar/`, served by `/api/avatar/[userId]` to the owner, admins, and anyone once the performer has a published site. Published Limelight sites are not served yet, so it is not on a public site.

## Round 3, Group 5 (2026-11-20): the assistant in Messages

- Code: `src/domain/assistant.ts` (topics, context whitelist, rule-based answers), `src/lib/assistant/` (context builder, Anthropic adapter, orchestration), `replyAsAssistant` in `src/app/actions/messages.ts`.
- Every performer message needs a topic. The assistant answers right after it (message with `fromAgent`). It hands off when the question is outside the facts it has (money, contracts, a casting decision, anything else): one honest line, `Thread.waitingForTeamSince` set, team alerted (`TEAM_INBOX_EMAIL`, if set). A team reply clears the status.
- Model (superseded in round 9, see docs/ASSISTANT.md: the key alone turns it on, Haiku 5.5). Round 3 text: To turn it on, set `ASSISTANT_MODEL_ENABLED=true` and `ANTHROPIC_API_KEY` in Vercel Production. It uses `claude-opus-5-5`, effort low, structured output, server-side refusal fallback to `claude-opus-4-8`, 25 s timeout; any failure falls back to the rules.
- Privacy: the context is a whitelist (stage first name, plan, completeness and missing items, specialties, job preferences, application titles and statuses, searches in progress). A test checks that no contact detail, content boundary or media link can appear in it.

## Contracts agreed for the beta brief (backend branch `feat/beta-server`)

Merged into `frontend-redesign` in `47670fe` and live since release 2. Full text in the shared notes.

- **Tapes**: `uploadMedia(file, { type: "SELFTAPE", tapeId?, title?, demoBrief? })`; `listTapes(profileId)` in `src/lib/tapes.ts`; `renameTape`, `deleteTape` in `src/app/actions/tapes.ts`.
- **Sharing**: `createShareLink(mediaId, { expiresInHours? })` (shown once; 72 hours by default, 7 days at most, 5 active per clip), `revokeShareLink(shareId)`, `listShareLinks(mediaId)`; public file at `GET /api/share/<token>`; the viewing page `/[locale]/partage/[token]` is front-end work.
- **Drafts**: `listMyDrafts`, `getMyDraft`; `attachMediaToDraft`, `detachMediaFromDraft`, `reviewDraft(draftId, "approve" | "decline" | "needs_info", reason?)`. Approving records a decision; nothing is submitted.
- **Connected accounts**: `listConnectedAccounts(userId)`, `disconnectProvider(provider)` (refused with `errors.lastLoginMethod` when it would leave no way to sign in).
- **Limelight leads**: `POST /api/limelight/interest` and the form action `requestPortfolioSite(prevState, formData)`; `listLimelightLeads()` and `GET /api/admin/limelight/leads.csv` for admins.
- **Published sites**: `resolveSiteByHost(hostname)`; `approveSitePreview`, `publishSite`, `unpublishSite`, `addSiteDomain`, `verifySiteDomain`.

Backend boundaries: `feat/beta-server` adds a migration, so it goes to production only on the owner's word; n8n exports stay out of the public repository; payments stay off.

## State at the end of the deployments and research brief (2026-11-19)

Brief: `~/Desktop/Agental_Claude_Cowork_Deployments_and_Research.md`.

- **Live**: release 2, deployment `agental-exmsrxj64-agentalco.vercel.app`, commit `bff6edb`, tag `live-2026-11-19-release2`. Its three additive migrations (`20261122000000_beta_server`, `20261122010000_account_timestamps`, `20261122020000_team_messages`) applied during the build. Nothing is deploying.
- **Verified on production**: public pages answer 200 (home, Talents, Limelight, the Maya Okafor sample, French About, both sign-in pages), the new copy shows, signed-in and admin pages send a signed-out visitor to sign-in. Signed-in flows (sign-up, Messages, Preferences, admin) were checked locally only.
- **Google sign-in**: both variables saved in Vercel; one redeploy turns the button on (see "Next concrete task").
- **Research**: four Google Docs (v2) in the owner's Drive. Markdown sources in `~/Downloads/agental-workflows/reports/`, outside this public repository. Open question for the owner: R4 says "a team that started in France and at USC" where the owner's story is "built by a father and son"; restore the original unless told otherwise.
- **Small UI question**: during setup the dashboard can show two "complete your profile" cards at once.
- **Still unset**: Limelight student price; a postal address for outreach drafts.

## Round 4, groups C and D (2026-11-20)

**Waiting on the owner (secrets, never typed by the agent):**
1. `SUPABASE_SERVICE_ROLE_KEY` in Vercel Production (Supabase project hnmvtcdxwyzksqwbhrgm, Project Settings, API Keys, service_role), then redeploy. `SUPABASE_URL` is already set. Storage then moves to Supabase: private buckets `selftapes`, `avatars`, `media` are created on first use, files under `{userId}/...`, TUS resumable uploads, 1-hour signed read links. Check `/api/health/storage` says `"storage":"supabase","directUploads":true`.
2. Then, signed in as an admin, open `/api/admin/storage/copy` (dry run: counts, sizes, `fitsFreePlan`) and `/api/admin/storage/copy?copy=1` repeatedly until `left` is 0, or until a call copies nothing (every remaining file is then `failed`, `tooBig` or `vanished`). The move is done when the dry run shows `notYetCopied` and `referencedOnlyOnR2` at 0 with `complete: true`. Until copied, reads fall back to R2. Do not run the copy if `fitsFreePlan` is false or null. Only files an account still points to are copied; `unreferencedOnR2` counts the rest, which stay on R2 and go when R2 is retired.
3. `RESEND_API_KEY` in Vercel Production (after the agental.co domain is verified in Resend), then redeploy. That opens the email gate for password accounts created since 2026-11-20T09:52:48Z (`EMAIL_VERIFICATION_REQUIRED_SINCE`); older unconfirmed accounts see the banner. `EMAIL_FROM` is `Agental <hello@agental.co>`.

**Video cap** is 50 MB (Supabase Free per-file limit): `VIDEO_MAX_MB` in src/domain/uploads.ts. Raise it with a paid plan.

**Media bug root cause:** not yet confirmed on production (no signed-in production session available to the agent). Fixes shipped regardless: only a missing session answers errors.unauthorized, the browser re-checks the session before leaving a recording, profile media no longer goes through a 1 MB action body, and the server logs the refusal reason (`[media] refused:` / `[avatar] refused:`).

## Round 4, group E (2026-11-20)

- Welcome: `src/components/app/welcome-tour.tsx`, rendered by the dashboard on `?welcome=1` (new accounts now land on `/talents/app?welcome=1`; Settings replays it). Casting keeps the older dialog tour.
- Google: names fill an empty profile (`src/lib/profile-prefill.ts`); the Google photo is only offered (`adoptProviderPhoto`). Scopes: openid profile email.
- Privacy page `/en/talents/confidentialite` is a factual draft for the founders to review.
- **Owner, to finish Google:** Google Cloud Console, project agental-515217, Google Auth Platform: Branding, set Application privacy policy link to `https://www.agental.co/en/talents/confidentialite` and save; Audience, Publish app. (The agent hit a password re-check there.)
- **Owner, keys:** the Vercel marketplace Supabase "Install" creates a new Supabase account, so it was not used; paste `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` by hand.

## Round 5, group A (2026-11-20)

**Data conservation (A3).**
- Production and preview deployments both read the Supabase Postgres database (`DATABASE_URL` is set for Production and Preview in Vercel; it never resets). Migrations run on production builds only (`tools/db/migrate-on-production-build.mjs`) and stay additive.
- `prisma/seed.ts` refuses to run unless `ALLOW_DEMO_SEED=true`, `NODE_ENV` is not production, and the database host is this machine (localhost); it only upserts `@demo.agental.co` accounts. `tools/db/purge-demo-accounts.ts` only matches `@demo.agental.co` and is a dry run unless `--apply`.
- Tests run against a local Prisma dev database (`localhost:51234`), never Supabase; integration tests skip unless the URL is local.
- Nothing in the repo deletes real accounts. chasques@usc.edu and other test accounts keep their data.

**Choices remembered on the account (A2).** Language: every app page writes the language in use to `User.locale`, and sign-in lands in that language. Cookie choice: saved on the account already; the app now puts it back in a browser that has none, so the banner does not ask again after sign-in. Since round 6 (`ConsentSync`, `browserConsentAfterSignIn` in `src/components/consent/consent-cookie.ts`), every signed-in page brings the browser in line with the account, the stricter choice winning per category, so a refusal is never undone silently. Settings > Cookie preferences starts from the choice this browser applies and writes the cookie only once the account has saved it. The Limelight design studio draft (public page, before an account exists) stays in the browser by design; the in-app "Your website" draft is saved on the server.

**Media (A1).** Refusals now say why: casting account, profile under 18, or no profile (`errors.mediaCastingAccount`, `errors.mediaMinor`, `errors.mediaNotAllowed`), and the server logs it. Recorder: 720p at 2.5 Mb/s, stops by itself before 50 MB, limit shown before recording; profile pictures 512 x 512 under 500 KB. Library: lists both destinations from the media list, with play and delete. Supabase Storage still waits on `SUPABASE_SERVICE_ROLE_KEY` (owner).

## Round 5, owner next steps (exact)

1. **Supabase key:** Supabase, project hnmvtcdxwyzksqwbhrgm, Project Settings, API Keys, Secret keys, row "default": copy. Vercel, agental, Settings, Environment Variables, Add: `SUPABASE_SERVICE_ROLE_KEY`, Production only, Sensitive. Then check `https://www.agental.co/api/health/storage` says `"storage":"supabase"` after the redeploy (step 5). If storage refuses the new `sb_secret_` key, use the legacy service_role key from "View legacy API keys".
2. **Resend DNS:** the domain agental.co is already added in Resend (agent, 2026-11-20). At name.com (DNS host for agental.co), add: TXT `resend._domainkey` = the DKIM value shown in Resend; CNAME `rsend` -> `rsend.forge.rmta.net`; CNAME `send` -> `send.forge.rmta.net`. Then press "I've added the records" in Resend.
3. **Resend key:** once Resend shows the domain Verified, API Keys, Create (sending access, agental.co), paste into Vercel as `RESEND_API_KEY` (Production).
4. **Google:** Google Cloud, project agental-515217, Google Auth Platform, Branding: privacy policy link `https://www.agental.co/en/talents/confidentialite`, Save; Audience: Publish app.
5. **Redeploy** the latest production deployment in Vercel so the keys are live.
6. Then the agent: copy R2 files (`/api/admin/storage/copy?copy=1` as admin), test uploads, real inbox emails and the Google round trip, and remove R2 once copied.

## Round 6, part 1 (2026-11-21)

- **Live:** `live-2026-11-21-r6-p1`, deployment `agental-96u1fwos4-agentalco.vercel.app`, commit `760942e` (PR #10, v0.5.2.0). Rollback: `vercel promote agental-4zl9j1leb-agentalco.vercel.app`.
- **Storage:** Supabase Storage is on in production since the owner added `SUPABASE_SERVICE_ROLE_KEY`. Next: as an admin on production, open `/api/admin/storage/copy` (dry run), check `fitsFreePlan` is true, then `?copy=1` until `left` is 0; the move is done when `notYetCopied` and `referencedOnlyOnR2` are 0 with `complete: true`. Then remove R2 in its own change.
- **Cookie choice:** follows the account on every signed-in page (stricter choice per category). Settings writes the cookie only after the account has saved it.
- **Local builds:** `.env` points `DATABASE_URL` at the production pooler, so a local `bun run build` pre-renders admin pages against production and can time out. Build with `DATABASE_URL` and `DIRECT_URL` set to the local prisma dev database instead.
- **Push guard:** a credential pre-push hook is installed locally. `.gstack-redact-allowlist` lists seven known test fixtures (placeholder hosts only); every push prints what it suppresses.

