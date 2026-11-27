# Legal copy: the single source (round 12, group 2)

Representation and services are two separate things, with the human in the loop. These
facts are written once, in `messages/en/common.json` under `legalCopy.*`, and every page
reads those keys (never retype them). Figures are tokens filled from code
(`src/lib/legal-copy.ts`: `{commission}` from the pricing table through
`MANDATE_BASE_COMMISSION_RATE`, `{months}`, `{noticeDays}` in `src/domain/mandat.ts`).
Change a sentence here and in `legalCopy`, nowhere else.

## The facts (and only these)

1. Representation (the mandate) is the agent agreement. Free: no sign-up fee, no membership
   fee. 12 months, renewed automatically, 60 days' notice, non-exclusive by default. The
   only fee is a commission of 10% of the gross fee, only on bookings obtained through
   Agental, only once the performer has been paid. Opportunities (role search, submissions,
   negotiation, contract review) come through representation, and only through it.
2. In the US, a licensed partner agency will hold representation and will receive the commission
   once it is in place (it is not yet: copy always speaks in the future for it, for example
   "{commission} commission on bookings, which will be held by a licensed partner agency").
   Agental provides the technology, the tools and the coaching.
3. Services (the subscription) are a separate technology contract with their own Terms,
   accepted separately. Optional, no commitment. They unlock tools. A subscription never
   gives better or earlier access to jobs (California Fee-Related Talent Services Law,
   AB 1319). A performer can be represented without paying anything.
4. Human in the loop, three confirmed claims only: nothing is sent or submitted without the
   performer's approval; a response submitted to a role goes to the Agental team's review
   and nothing is sent to a casting site; replies to emails we receive go out only after a
   staff member approves them. Nothing is claimed about people reviewing contracts.
5. Beta: the agreement can be read now and is signed once the licensed partner is in place.
   Payments are off until the company exists. `MANDATE.approvedVersion` stays `null`.

## Where each key is read

| Place | Keys (`common.legalCopy.`) |
| --- | --- |
| Home "how it works" and talents `comment-ca-marche` | block `TwoThings`: `twoThingsTitle`, `repTitle`, `repFree`, `repTerms`, `repPartner`, `toolsTitle`, `toolsBody`, `humanLoop`, `beta` |
| Talent pricing (`tarifs`) | `pricingLine` at the top, `commissionNote` under the plans |
| Cookies: banner, cookie preferences, privacy policy "Cookies" section | `cookiesNever` |
| Account creation | (a) account: one box, Privacy Policy and cookies only (`auth.agreePrivacy`), with `auth.agreeSeparate` under it; (b) Agreement step on its own screen: `mandate.*`, `beta`, `onboarding.mandat.closed`; (c) Plans step, later and optional: `onboarding.plans.*`, the existing plan cards, no payment |
| Wizard Agreement step | `mandate.summaryTitle`, `free`, `commission`, `nonExclusive`, `term`, `notice`, `fullText`, `noPayment`, `beta`. No plan, upsell or price. |

## Acceptance records

Three acceptances at sign-up, never merged, each tied to its own relationship, each with
its own date and version. None implies another. All are visible on the admin account page
(Accounts > an account > "Acceptances").

| Acceptance | Relationship | Date | Version | Written by |
| --- | --- | --- | --- | --- |
| Privacy Policy and cookies (sign-up box, or the Google sentence) | account and cookies | `User.privacyAcceptedAt` | `User.privacyVersion` | `acceptanceColumns()` in `src/domain/legal-versions.ts` |
| Representation step seen and acknowledged (not a signature) | representation | `User.representationAckAt` | `User.representationAckVersion` (`REPRESENTATION_STEP_VERSION`) | `acknowledgeRepresentationStep` in `src/app/actions/onboarding.ts`; never writes `Mandat` |
| Plans step (optional) with the plan picked | plans | `User.plansStepAt` | `User.plansStepVersion` (`PLANS_STEP_VERSION`), `User.plansStepChoice` | `recordPlansStep`; opens no payment, changes no subscription |
| Representation agreement (signature) | representation | `Mandat.signedAt` | `Mandat.documentVersion` | `signMandat` (refuses while `MANDATE.approvedVersion` is null) |
| Terms of Service (plans) | plans | `User.termsAcceptedAt` | `User.termsVersion` | `acceptanceColumns(true)`, only when `TERMS_PAGE_ENABLED` |
| Cookie choice | cookies | `User.consentAt` | `User.consentVersion` | `saveConsent` (separate from all of the above) |

A cookie choice never counts as accepting representation or a plan (`cookiesNever`, shown in
the banner and in Settings > Privacy and cookies). Migration: `20270102000000_round121_acceptance_steps`.

Known gap: when `TERMS_PAGE_ENABLED` is on, the Terms date is written in the same act as the
sign-up box (its sentence names the Terms). Before enabling it, tie the Terms to the Plans
step so plans stay accepted separately.
