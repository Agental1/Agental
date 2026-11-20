# One-person calibration

A small evaluation of the dry-run workflow (`docs/WORKFLOWS.md`) on one performer. "Calibration" here means checking the rules against one person's stated preferences and labeled examples. No model was trained or fine-tuned, and no vendor training setting was changed.

Run on 2026-11-19 with rules `rules-2026-11-19.2`. Everything below can be reproduced:

```bash
bun tools/calibration/report.ts
```

```bash
./node_modules/.bin/vitest run tests/lib/workflow-calibration.test.ts
```

## Who and what

- **Performer: synthetic.** Maya Okafor does not exist. She is the fictional Los Angeles screen and stage actor of the site's sample portfolio. No volunteer with documented consent was available, so no real person's data was used. What still needs a real participant is listed at the end.
- **Profile used** (`tools/calibration/performer.ts`): specialties screen acting and stage acting; English and Spanish; based in Los Angeles; works in the United States; paid work only; minimum rate 200 USD; regional travel; on set; comfortable with animals; content boundary: no nudity; available December 1 to February 28, away December 22 to 28.
- **Briefs** (`tools/calibration/briefs.ts`): 17 fictional briefs. 5 relevant, 5 irrelevant, 1 expired, 3 incomplete, 3 ambiguous. Each carries a label (`would consider`, `would decline`, `needs info`), the reason, and the rule expected to carry it.
- **Labels** were set by the pilot owner's stand-in for the synthetic performer (this engineering session), from the profile above. A real participant would label their own.
- **Split:** 12 briefs were looked at while the rules were adjusted ("tune"). 5 were set aside and scored once, after the rules were frozen ("unseen").
- **Data kept:** the two fixture files in the repository. Nothing is in a database, nothing was sent anywhere, and no model was called. To reset or delete the exercise, delete `tools/calibration/` and the test file.

## Two paths compared

- **Baseline:** what a simple matcher does. Suggest every open brief whose role type is one of the performer's specialties; decline the rest. It reads no preference and never asks a question.
- **Workflow:** the dry-run path with rules only, which is how it ships (the model step is off by default). `eligible` counts as a suggestion, `needs_review` as a question for the performer, `ineligible` as a decline.

## Results

| Measure | Baseline | Workflow |
|---|---|---|
| Agrees with the label, all 17 | 7 of 17 | 15 of 17 |
| Agrees with the label, 12 tuning briefs | 4 of 12 | 10 of 12 |
| Agrees with the label, 5 unseen briefs | 3 of 5 | 5 of 5 |
| Appropriate suggestions | 4 of 12 suggested | 4 of 5 suggested |
| Suitable briefs missed | 0 of 4 | 0 of 4 |
| Hard constraints blocked | 1 of 5 | 5 of 5 |
| Hard constraints violated (suggested anyway) | 4 of 5 | 0 of 5 |
| Open questions surfaced | 0 of 6 | 4 of 6 |
| Expected reason given | not applicable | 12 of 13 |

The five hard constraints in the set: unpaid work for a paid-only performer, a shoot outside her countries, a closed call, dates she is away, and a role with nudity. All five are in the tuning set; the unseen set has none, so the "0 violated" result rests on those five.

Other checks, all pinned by the test:

- **Evidence.** Every objection and every question names the fields it read. No reason is given without them.
- **Re-run.** A second run gives the same decisions, dedupe keys and input hashes for all 17 briefs. In the database-backed flow test (`tests/api/workflow-flow.test.ts`) the same request sent twice creates no extra draft.
- **Preference change.** Switching "paid only" to "open to unpaid" changes one brief, the unpaid student film (T03), from declined to a question (she also has a minimum rate). Changing the content boundary changes one brief, the role with nudity (T08). No other brief moves.
- **Access.** A second performer cannot read, attach to or review the first one's draft, and cannot read their self-tape (`tests/api/workflow-flow.test.ts`, `tests/api/media-privacy.test.ts`).
- **External submission.** None exists in the code path. Approving a draft records a decision and nothing else.
- **Time.** All 17 briefs are assessed in about 25 ms on a laptop. The time for a person to review a draft was not measured: there was no participant and the draft pages are not built yet.

## Two useful examples

- **T07, a guest role on December 23 and 24.** The baseline suggests it: the role type matches. The workflow declines it and says why: the dates overlap a period she marked unavailable (`brief.startsOn`, `brief.endsOn`, `profile.availability`).
- **H01, a short film at 150 USD (unseen).** The baseline suggests it. The workflow holds it as a question, "the rate is under your minimum", and leaves the choice to her. A rate has no unit in a brief yet, so the rule asks and never refuses.

## Two misses

- **T10, a bilingual audio guide.** Label: needs info. Workflow: declined, because voice work is not among her specialties, and a role type outside the specialties is a hard failure. A bilingual actor might well ask about it. Either the performer adds the specialty (the recommendation then changes), or the rule softens to a question when the brief's other requirements match. Left as is: softening it would also turn the commercial (T04) and the musical (H02) into questions.
- **T12, a stage run in New York.** Label: needs info (travel and housing decide). Workflow: suggested. The profile says "regional travel", but no rule reads it: a brief gives a city and a country, and the rules cannot tell how far a city is. Same country passes. A travel rule needs a region on the brief or a distance source.

## What changed during tuning

Looking at the tuning set led to two changes, both before the unseen briefs were scored:

1. A rule for unpaid briefs (`compensation`). Before it, a paid-only performer got an unpaid brief as a suggestion.
2. The old Preferences form stored "no" for nudity and animals for everyone who pressed Save. That default is now read as "no answer", so the workflow asks instead of assuming a refusal (`src/domain/preferences.ts`).

## Stop conditions

Promotion stops if any of these happens. The test fails on the first three.

| Condition | Result |
|---|---|
| A hard constraint is violated | 0 of 5 |
| A reason is given without evidence | none |
| A re-run changes an answer or creates a second draft | no |
| Access across accounts | refused in both database-backed tests |
| An external submission is triggered | no such code path |

## Limits

- One performer, and a synthetic one. 17 briefs, 5 of them unseen, written by the same hand that wrote the rules.
- The labels are a stand-in's, not a performer's.
- The model step was not exercised. It is off by default, and the live API was never called.
- Rule reasons are in English only.
- Two rules are known to be coarse: role type (T10) and travel (T12).
- Every draft still goes to the performer for review. Nothing here supports removing that step.

## Still to validate with a real participant

An adult volunteer with written consent for this test (scope, retention, how to withdraw, who owns the test profile). Their own labels and reasons on at least 12 briefs. The time it takes them to review a draft once the draft pages exist. Whether the questions the workflow asks are the ones they would want to be asked.
