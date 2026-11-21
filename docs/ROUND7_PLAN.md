# Round 7 plan

Branch `round7`, cut from `frontend-redesign` at `27e874c` (v0.5.4.0 live). Brief: the owner's
Round 7 prompt (Desktop, not in the repo). Workflows used: only `Beta V2.json` (Part C) and
`Beta V2 - Direct Replies.json` (Part D), from `~/Downloads/agental-workflows/n8n/agental-pilot/`.
They stay outside this public repository.

Checked before starting: `CLAUDE.md` and `docs/DECISIONS.md` are committed on
`origin/frontend-redesign`; the working tree was clean.

## Access and decisions needed from the owner

Access:

1. **n8n API key.** n8n Cloud, Settings, n8n API, Create an API key (label `agental-round7`).
   Save it on the Mac in `~/.config/agental/n8n.env` as `N8N_API_KEY=...` (`chmod 600`). I read
   it from that file and never print it. Without it, I use the browser pane (slower).
2. **Staging database.** Confirm that Vercel's Preview `DATABASE_URL`/`DIRECT_URL` point at the
   `agental-dev` Supabase project and not production (I cannot read Sensitive values). If unsure,
   I can check by deploying a preview of `round7` and reading its health route: that is a
   preview deploy, never production, and needs your yes.
3. **Shared secret between the app and n8n.** One random value, used twice: Vercel Preview
   variable `N8N_SHARED_SECRET`, and an n8n Header Auth credential (`Agental staging`, header
   `x-agental-signature` is computed from it; details in Part C). Create it with
   `openssl rand -base64 32` and paste it in both places yourself.
4. **Vercel preview protection.** n8n cannot reach a protected preview. Vercel, agental,
   Settings, Deployment Protection, Protection Bypass for Automation: create one and put it in
   the same n8n credential as header `x-vercel-protection-bypass`.
5. **Saved n8n credentials.** Confirm the names of the saved OpenAI, Perplexity and Gmail OAuth
   credentials in the n8n project, and which Gmail mailbox the Gmail credential uses.
6. **Push notifications.** Remote Control is off for this session and auto mode refused to turn
   it on. Turn it on in the session toolbar, or nothing I push reaches your phone.

Decisions (mine to ask, yours to make):

- **A. Admin account.** Which exact account gets admin? Proposed: `contact@agental.co`, but it
  may be a shared mailbox. Until you answer, no role is granted.
- **B. Account deletion.** Proposal in Part A below; nothing is deleted this round.
- **C. Existing accounts.** The new account status starts at `unreviewed` for everyone, except
  accounts already marked `TEST` or `ELIGIBLE` in the older `workflowAccess` column, which become
  `test` and `approved`. Admins are counted under staff whatever their status.
- **D. Staging mode.** Existing rule kept: in staging only `test` accounts can trigger agents; in
  live only `approved` ones. A test account never gets real research or email.

Not allowed to me this round, by auto mode: writing allow rules into
`.claude/settings.local.json` (refused as "undermining oversight"). Routine commands may prompt.

## Part A. Staff-only admin portal

Reuse `/admin` (layout checks `isAdmin` from the database), `src/lib/admin/accounts.ts`,
`audit()`, the GET-form filters and the CSV route.

- A1 accounts
  - Additive migration: `User.accountStatus` (`UNREVIEWED` default, `APPROVED`, `TEST`, `STAFF`,
    `SPAM`), `User.agentsOptInAt` (first "Start finding roles" click), `User.autoSearchOptIn`
    (six-hour search, default false). Backfill from `workflowAccess` as in decision C.
    `workflowAccess` stays in the table, no longer read.
  - Counts on `/admin` and `/admin/comptes`: unique accounts by type (performer, casting), with
    staff (status `STAFF` or `isAdmin`), test and spam apart. Limelight leads are a separate table
    and never counted.
  - List: name, email, type, signup date, method, verified, status, "Agents enabled". Filters for
    each, search, CSV with the new columns.
  - Status change: one row or many (checkboxes, one server action, admin re-checked on the
    server, one audit entry per account with before and after).
  - Eligibility (`src/domain/workflow/eligibility.ts`): verified, status `APPROVED` (or `TEST` in
    staging), adult, and opted in. Enforced in `startRoleSearch` before the row is written: the
    click itself is the opt-in, so a verified, approved performer's first click is accepted and
    stamps `agentsOptInAt`; everyone else gets a clear refusal and no job.
- A2 Limelight: page exists (name, email, date, reference, follow-up status NEW, CONTACTED,
  CLOSED, editable). Add the alert state per lead (pending, sent, failed, from `OutboxMessage`).
- A3 Waiting for a human: `/admin/messages?waiting=1`, threads with `waitingForTeamSince`, oldest
  first; the existing reply clears it (already the case in `sendTeamReply`; test added).
- A4 Jobs: `/admin/recherches` shows searches with account, status, timestamps, error; add
  `WorkflowRun` rows and application drafts with their recorded statuses.
- A5 Revenue: `/admin/revenus` says "Unavailable" while no live payment source is verified; mock
  orders never counted.
- Deletion proposal: `docs/ACCOUNT_DELETION_PROPOSAL.md`.

## Part B. Limelight

Trace both entry points to `LimelightLead` and `OutboxMessage`; one sample submission on the
local database; answer the brief's questions in `docs/LIMELIGHT_TRACE.md`. Finding so far:
`RESEND_API_KEY` and `TEAM_INBOX_EMAIL` are not set in Vercel, so alerts are queued, not sent.

## Part C. App to "Beta V2"

C1 trace table; C2 signed endpoints `/api/n8n/casting/claim` and `/complete` (HMAC with
`N8N_SHARED_SECRET`, timestamp window, idempotency key per job), eligibility re-checked at claim,
minimum payload, results stored as drafts; C3 Messages behind `AGENTAL_FIND_STAGING=1`, inbox
`/api/n8n/inbox/claim|complete|review`.

## Part D. "Beta V2 - Direct Replies"

Import as a separate inactive workflow, bind saved credentials, staging URL, provider test, then
prepare D3 and stop for the owner.

## Each part ends with

Targeted tests while working, full suite on the local DB, `/review` and `/qa` on that part, fixes,
"Part X is ready to deploy" in `docs/HANDOFF.md`. No deploy until the owner says "deploy".
