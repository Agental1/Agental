# App and n8n: how they connect (round 7, Part C)

Workflows used: "Beta V2" (casting and website support) and "Beta V2 - Direct Replies"
(email replies). The exports stay outside this public repository
(`~/Downloads/agental-workflows/n8n/agental-pilot/`).

## C1. Today's flows (before round 7)

| Flow | UI action | Backend handler | Database record | Workflow run |
|---|---|---|---|---|
| Performer message | Messages, pick a topic, Send | `sendMessage` server action, then `replyAsAssistant` (`src/app/actions/messages.ts`) | `Message` in the performer's TEAM `Thread`; assistant answer as a `fromAgent` message; `Thread.waitingForTeamSince` on handoff | none: rules (or the Anthropic model if `ASSISTANT_MODEL_ENABLED`), no n8n |
| Staff reply | Admin, Messages, open thread, Send | `replyAsTeam` | `Message` with `fromTeam`; clears `waitingForTeamSince`; audit `message.team.reply` | none |
| Casting search | Dashboard, green "Start finding roles" | `startFindingRoles` then `startRoleSearch` (`src/lib/role-search.ts`) | `role_search_requests` row, status `queued` | none: rows stayed queued, nothing claimed them |
| Agental Find preview | Messages, choose Samantha or Adrian, Save | client state only (`agent-find-preview.tsx`) | none | none |

## C2 and C3. What round 7 adds

All n8n calls use `Authorization: Bearer <N8N_SHARED_SECRET>`; every route answers 404 while
the secret is not set (or shorter than 24 characters), 401 on a wrong one.

| Route | Called by (node) | Body | Answer |
|---|---|---|---|
| `POST /api/n8n/casting/claim` | Beta V2, "Claim Opted-In Profiles" | `{ limit, executionId }` | `{ jobs: [{ requestId, profile }], scheduled, canceled, mode }` |
| `POST /api/n8n/casting/complete` | Beta V2, "Record Scheduled Results" | `{ executionId, results: [{ requestId, status, roles }] }` | `{ results: [{ requestId, outcome, drafts }] }` |
| `POST /api/n8n/inbox/claim` | Direct Replies, "Claim Reply for This Message" | `{ threadId, messageId, executionId }` | `{ status: claimed or existing, threadId, messageId, claimId }` |
| `POST /api/n8n/inbox/complete` | Direct Replies, "Save Reply Receipt and Review Flag" | the workflow's receipt | `{ recorded, status, duplicate }` |
| `POST /api/n8n/inbox/review` | Direct Replies, "Queue Inbox Review" | `{ threadId, messageId, reason, queue, priority }` | `{ queued, status }` |

Rules the code enforces:

- **Eligibility twice.** At the click (Part A) and again at claim: a search whose account is no
  longer eligible is cancelled, never sent to n8n.
- **Atomic, idempotent.** Claim uses `FOR UPDATE SKIP LOCKED` and records the n8n execution id
  (`claimedBy`); a retried claim of the same execution gets the same rows. A completion is
  accepted once, only from the execution that claimed the row; a retry answers
  `already_recorded` and writes nothing.
- **Minimum data.** The profile sent is: profile id, country, adult flag, city, languages,
  skills (specialty kinds and tags), preferred project types. No name, email, birth date, media
  or contact detail.
- **Model output is checked.** Each ranked role is validated (https source URL, lengths, at most
  8); anything else is dropped.
- **Drafts only.** Each role becomes a `Brief` (source `n8n-beta-v2`, with its source URL) and an
  `ApplicationDraft` in status `DRAFT`. The performer sees them in Applications, "Roles found
  for you", with the source link and the draft text. Nothing is sent or submitted.
- **States.** Performer (Applications) and admin (Applications and AI jobs) see queued, running,
  completed, failed, canceled. A failed or cancelled search gives the search back.
- **Six-hour search.** Each claim first queues one search per six-hour window for performers who
  turned it on (`User.autoSearchOptIn`), under the same gate and quota. There is no switch for
  performers in the UI yet.
- **Messages (C3).** With `AGENTAL_FIND_STAGING=1` and `N8N_SUPPORT_WEBHOOK_URL`, the assistant
  sends the question alone to the workflow's "Website Support Request" entry and uses its
  answer; a recommended handoff, a failure or any odd answer falls back to the in-app rules. The
  handoff is now recorded (thread marked waiting) before the message saying so is posted. The
  Agental Find preview stays UI-only.
- **Email replies.** One claim per Gmail message (unique index), one receipt, review items
  listed in Admin, Messages, "Waiting for the Agental team". Only Gmail ids and reasons are
  stored.

## Variables (Vercel, Preview first; the owner pastes them)

| Name | Value |
|---|---|
| `N8N_SHARED_SECRET` | random, at least 24 characters (`openssl rand -base64 32`); the same value goes in the n8n Header Auth credential as `Bearer <value>` under the header name `Authorization` |
| `WORKFLOW_MODE` | unset (staging: test accounts only) or `live` (approved accounts only) |
| `AGENTAL_FIND_STAGING` | `1` to let n8n answer Messages (staging only) |
| `N8N_SUPPORT_WEBHOOK_URL` | the workflow's "Website Support Request" test or production webhook URL |

## Can people email us from the app today?

Not through a form or a link. The address contact@agental.co appears as plain text in three
places: the Limelight student price line and the privacy page (twice). Messages is the in-app
channel. Emails sent to the team mailbox are the separate Gmail channel handled by the Direct
Replies workflow; the app has no Gmail trigger.
