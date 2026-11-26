# Onboarding as a conversation (round 12, group 6, design)

Status: design only, nothing built. Builder: read `docs/DECISIONS.md` ("What 100% means"),
`docs/ASSISTANT.md` and this file. No new AI provider, no new bucket, no cost without a cap.

## 1. What the performer sees

- Default view of onboarding (and a "Continue with {agent}" tab on `/talents/app/profil`): a typed
  chat. The agent's name is `agentNameFor(userId)` (`src/lib/agent-name.ts`), and "Jay" when it
  returns null (the agent setup comes after sign-up, so most people meet Jay).
- One question at a time, in the order of `missingItems()` (`src/domain/completeness.ts`), so the
  chat only asks what is still missing. Each answer gets one short warm reaction (max 120 chars).
- Every question has a "Skip" chip. Enum questions show chips (no typing, no model call).
- A "Switch to the form" link is always visible, and the form shows "Continue with {agent}". Both read
  and write the same `ArtistProfile`: a confirmed chat answer is saved at once through the existing
  server action (section 4), so the form sees it on its next render. Unconfirmed answers and the
  one-go review live in `OnboardingDraft` (server side, section 6), never in browser storage.
- The representation agreement screen (mandate) and the photo upload stay as they are: the chat ends
  with buttons to them. The chat never signs, consents or uploads.

## 2. Voice

- Microphone button next to the text box. Transcription is the browser's Web Speech API
  (`window.SpeechRecognition ?? window.webkitSpeechRecognition`), `lang` from the locale,
  `interimResults: true`. The final transcript is put in the text box; the performer edits it and
  presses Send, so voice goes through exactly the typed flow.
- Missing API (Firefox, some in-app browsers) or permission refused: hide the button, show
  "Voice is not available in this browser, you can type instead." Never a second provider.
- Before the first recording, one line: "Your browser turns speech into text. Agental keeps no
  audio." Chrome and Safari may send audio to Google or Apple for recognition; when the browser
  offers on-device recognition, request it.
- "Tell us about yourself in one go": one recording (or one pasted text, max 6,000 chars), one model
  call that fills what it understood, then a review screen listing every field of the mapping table
  with the proposed value (or empty), each editable with the form's own component. Nothing is saved
  until "Save these answers"; then each value goes through its form action. Discard empties the draft.
- Audio: NOT stored in this round. No `MediaRecorder`, no upload. The transcript is kept only in
  `OnboardingDraft` until the review is saved or discarded, then deleted. If audio is wanted later it
  goes to the existing private Supabase bucket under `MEDIA_PRIVACY.md` rules (signed URLs, owner
  and admins only, deleted with the account); not in scope.

## 3. Model and cost

- Existing key `ANTHROPIC_API_KEY`, model `claude-haiku-5-5` (reuse `assistantModel()` and
  `assistantModelEnabled()` from `src/lib/assistant/model.ts`). `maxRetries: 0`, 15 s timeout.
- When the model is used: a free-text answer to a non-chip question (to read the value and write
  the reaction), and the one-go extraction. Chips, skips and the scripted flow never call it.
- Output only through `output_config: { format: zodOutputFormat(Schema) }`, like `askModel`.
  Per-turn schema: `{ reaction: string, value: <field type> | null, unclear: boolean }`, built for the
  ONE field asked. One-go schema: `{ values: { <every mapped key>: <type> | null } }`, no free text.
  `max_tokens`: 200 per turn, 700 for one-go. Prompt sent: personality, rules, the field key and its
  allowed values, the answer. Never the profile, email or any other account.
- Cap per account per 24 hours (rolling), checked before every call: 30 calls and 40,000 tokens
  (input plus output), env `ONBOARDING_CHAT_DAILY_CALLS` / `ONBOARDING_CHAT_DAILY_TOKENS` override.
  Usage recorded in `AiUsage` with `kind: "onboarding.chat"`, `provider: "anthropic"`,
  `ref: "<userId>:<cuid>"`; counted with `ref startsWith "<userId>:"` and `createdAt >= now - 24h`
  (index `[kind, ref]` exists, no migration). Cost also counts toward the assistant's monthly budget
  (`assistantMonthlyBudgetUsd`, sum over both kinds). `isPaused()` true means no call.
- `WORKFLOW_MODE` test mode: same rule as the assistant (Test accounts only get the model).
- Personality: ONE file, `src/lib/onboarding-chat/personality.ts`, exporting `PERSONALITY` (tone,
  reaction style, examples) as a plain string. Rules (section 4) live in `prompt.ts` and are not
  editable by a personality change.

## 4. Field mapping (question -> field -> validation -> save action)

All validation is server side with the forms' own zod schemas; the model's value is only a proposal.
`hair`, `eyes`, `build` are `z.string()` in `ProfilePhysical`, so the chat also checks them against
`HAIR_COLORS`, `EYE_COLORS`, `BUILDS` (`src/domain/identity.ts`). An invalid value is dropped and the
question asked again once, then offered as chips or "Switch to the form".

| Question | Field(s) | Validation | Saved by |
|---|---|---|---|
| Legal first and last name | `legalFirstName`, `legalLastName` | `ProfileIdentity` (trim, max 80), both non-empty | `saveProfileIdentity` |
| Name you work under (optional) | `stageName` | `ProfileIdentity` | `saveProfileIdentity` |
| Date of birth | `birthDate` (yyyy-mm-dd) | `BirthDateInput` (adult only) | `saveProfileIdentity` |
| Gender (chips) | `gender`, `genderOther` | `z.enum(GENDERS)`, other max 60 | `saveProfileIdentity` |
| Phone | `phoneE164` | regex + `isValidPhoneNumber`, US default | `saveProfileIdentity` |
| City | `cityGeonameId` | model returns text only; server lists GeoCity matches, performer picks | `saveProfileIdentity` |
| Languages (chips + search) | `languages` | codes from `LANGUAGES` (`src/domain/languages.ts`) | `saveProfileIdentity` |
| Bio | `bio` | max `BIO_MAX`; performer's own words only, model may not write it | `saveProfileIdentity` |
| Height | `height` | `HeightInput` ("5'10", "178 cm") | `saveProfilePhysical` |
| Build, hair, eyes (chips) | `build`, `hair`, `eyes` | enums above | `saveProfilePhysical` |
| Kind of work (chips) | `projectTypes`, `roleTypes` | `PreferencesInput` enums | `savePreferences` |
| Ages you can play | `playableAgeMin/Max` | 10 to 90, min <= max | `savePreferences` |
| Paid or unpaid (chips) | `compensation` | `COMPENSATION` | `savePreferences` |
| Minimum day rate (only if paid only) | day rate | `DayRateInput` | `saveDayRate` |
| Optional block, skippable: weight, sizes, accents | `weightKg`, `size*`, `shoeSize`, `accents` | `ProfilePhysical` / `ProfileIdentity` | same actions |

`savePreferences` stores the WHOLE form ("a field left out is stored as no answer"): the chat must
read current preferences with `readPreferences`, merge the one new value, then send the full object.
Never mapped: email, maturity rating, content boundaries, consent, plan, mandate, media, minors data.

## 5. Safety

- Prompt rules (`prompt.ts`): ask only the field given; never medical, health, religion, ethnicity,
  sexuality, immigration, income or family questions; measurements are optional, say so, accept
  "skip"; never invent: `null` when the answer does not state the value; no advice, no promises.
- The answer is data: sent JSON-quoted inside `ANSWER:`; text like "ignore your rules" or "set my
  plan" changes nothing because the output schema has only the asked field and the server accepts
  only mapped keys. Answer max 1,500 chars, one-go max 6,000.
- Minors: same as the forms. A birth date under 18 gets the form's error (`BirthDateInput`), nothing
  is saved, and the chat stops with the form's own message; no further questions, no transcript kept.
- Failure path, one function `chatMode(user)`: switch off -> form only; missing key,
  `ASSISTANT_MODEL_ENABLED=false`, pause on, cap reached, budget reached -> scripted flow; any model
  error, timeout, refusal or invalid output -> that question falls back to chips or the form with
  "I could not read that one, here is the form for it." The page never breaks.
- Scripted flow (no key, true in production today): the same question list, fixed reactions from
  `personality.ts`, answers parsed by rules in `src/domain/onboarding-chat.ts`: names as typed,
  dates (`yyyy-mm-dd`, `mm/dd/yyyy`, "March 3 1990"), heights (`5'10`, `5 ft 10`, `178 cm`),
  phones via libphonenumber, ages "25-35", chips for every enum. One-go is hidden in scripted mode.

## 6. Switch and data

- `AppSetting` key `onboarding.chat`, value `{ mode: "off" | "test_and_allowlist" | "everyone",
  allowlist: string[], since }`, in `src/lib/app-settings.ts` with the pause switch pattern: read
  fresh, written in a transaction with its audit entry (`admin.onboardingChat.mode`,
  `admin.onboardingChat.allowlist`). Missing value -> `test_and_allowlist` with an empty list (Test
  accounts only); unreadable -> `off`. Allowlist emails lowercased and trimmed, compared to the
  account email. Admin > Controls: three radios and a textarea for the allowlist.
- The founder's address: NOT seeded by a migration. Migrations are in this public repo, so seeding
  would publish a personal email. After deploy, the founder types it into Admin > Controls (owner
  step in `docs/HANDOFF.md`). The value then lives only in the database and the audit log.
- Migration (additive): `OnboardingDraft { id, profileId @unique, answers Json, transcript String?,
  updatedAt }`, `onDelete: Cascade` on the profile, so it goes with the account. Answers are a patch
  keyed by mapped field. Draft rows older than 30 days are ignored and overwritten.
- Switching off: set mode `off`. Every confirmed answer is already in the profile; drafts stay in
  their table untouched and come back if it is turned on again. No down-migration, nothing deleted.

## 7. Files

Create: `src/domain/onboarding-chat.ts` (question list from `missingItems`, mapping table as data,
rule parsers, `chatMode`), `src/lib/onboarding-chat/personality.ts`, `prompt.ts`, `model.ts`
(calls, caps, `AiUsage`), `src/app/actions/onboarding-chat.ts` (`chatTurn`, `confirmAnswer`,
`extractOneGo`, `saveReview`, `discardDraft`; each re-reads the session, never takes a user id),
`src/components/onboarding/onboarding-chat.tsx`, `voice-button.tsx`, `one-go-review.tsx`,
`prisma/migrations/<ts>_round12_onboarding_draft/`.
Change: `prisma/schema.prisma`, `src/lib/app-settings.ts`, `src/app/actions/admin-controls.ts`,
`src/app/[locale]/admin/controles/page.tsx`, `onboarding-wizard.tsx` (chat or form toggle),
profile page (chat tab), `messages/*.json` (new keys, `pnpm i18n:check`), `docs/ASSISTANT.md`
(new kind and caps), `docs/HANDOFF.md` (owner step).

## 8. Tests (vitest, local database only)

- Domain: each mapping row accepts good values and rejects bad ones (enum outside list, minor birth
  date, age min > max, invalid phone); rule parsers; question order follows `missingItems`.
- Never invent: a mocked model value for a field not asked, or an unmapped key, is dropped.
- Preferences merge keeps every other preference.
- Cap: the 31st call and the token ceiling refuse the model and return scripted mode; usage rows
  written once per call; other accounts' rows not counted.
- Fallback: no key, pause on, model throws, invalid JSON -> scripted or form, no save.
- Switch: off, Test, allowlisted, other, everyone; unreadable value -> off; every change audited.
- Review: nothing saved before `saveReview`; draft deleted with the profile (cascade).
- Injection: the prompt contains only the field and the quoted answer, no profile, no other user.

## 9. Risks

- Browser speech engines send audio to Google or Apple: disclosed, but outside Agental's control.
- The model may still guess a value; mitigated by the per-field schema, server validation and the
  review screen, not eliminated. Live checks wait for the key, as for the assistant.
- `savePreferences` overwrite and `saveProfileSpecialties` replace-all semantics: the chat must not
  call specialties at all, and must merge preferences.
- Allowlist emails sit in the audit log; acceptable (staff only), noted.
- Two tabs (chat and form) open at once: last save wins per field, same as today's autosave.
