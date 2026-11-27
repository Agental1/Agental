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
2. In the US, a licensed partner agency holds representation and receives the commission.
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
| Account creation | (a) account: one box, Privacy Policy and cookies only; (b) agreement on its own screen: `mandate.*` and `beta`; (c) plans later, optional |
| Wizard Agreement step | `mandate.summaryTitle`, `free`, `commission`, `nonExclusive`, `term`, `notice`, `fullText`, `noPayment`, `beta`. No plan, upsell or price. |

## Acceptance records

Each acceptance writes its own date and version; none implies another.

| Acceptance | Date | Version | Written by |
| --- | --- | --- | --- |
| Privacy Policy and cookies (sign-up box, or the Google sentence) | `User.privacyAcceptedAt` | `User.privacyVersion` | `acceptanceColumns()` in `src/domain/legal-versions.ts` |
| Representation agreement | `Mandat.signedAt` | `Mandat.documentVersion` | `signMandat` (refuses while `MANDATE.approvedVersion` is null) |
| Terms of Service (plans) | `User.termsAcceptedAt` | `User.termsVersion` | `acceptanceColumns(true)`, only when `TERMS_PAGE_ENABLED` |
| Cookie choice | consent record | notice version | `saveConsent` (separate from all of the above) |

Known gap: when `TERMS_PAGE_ENABLED` is on, the Terms date is written in the same act as the
sign-up box (its sentence names the Terms). Before enabling it, give the Terms their own
step so plans stay accepted separately.
