# Account monitoring, suspension and deletion: notes for counsel (DRAFT)

Round 9, group 1 (2026-11-22). Written by the engineering agent from public sources. This is
not legal advice: every point marked `LAWYER:` needs counsel before the Privacy Policy and the
Terms of Service are published as final. The matching texts are the "Account security and abuse"
section of the Privacy Policy (`messages/*/common.json`, `privacy.sections`) and section 9 of
`docs/legal/TERMS_DRAFT.md`.

## What Agental does today

- **Signals watched.** Sign-up date, sign-in dates (`lastSignInAt`, since round 9), whether the
  email was verified, sign-up method, failed sign-in and sign-up attempts (rate limits in
  `src/lib/abuse.ts`), how the profile and media are used, AI search launches, and messages to the
  team. Nothing is bought from or shared with a third party for this.
- **Who decides.** A staff member, in the admin. No automated system suspends or deletes an
  account. The rate limits only slow repeated attempts.
- **What staff can do.** Mark an account Spam or revoke its access to the AI agents; send the
  warning "Confirm your email within 7 days to keep your Agental account"; delete an account.
- **Deletion.** A deleted account is disabled at once (no sign-in, sessions ended, agents off) and
  kept for 30 days, when staff can restore it. After 30 days it is removed with its files. Every
  deletion, restore and purge is in the audit log with a hash of the email, never the address.
  Staff, test, admin and paying accounts cannot be deleted this way.
- **Cookies.** Account monitoring does not use cookies beyond the strictly necessary sign-in and
  security cookies listed in the cookie banner. It must not be described as a cookie.

## California and US law: what applies

### 1. CCPA / CPRA (Cal. Civ. Code § 1798.100 and following)

- **Does it apply yet?** The CCPA covers a for-profit business that meets one of three tests:
  annual gross revenue above **$26,625,000** (the 2025 inflation-adjusted figure, Civ. Code
  § 1798.140(d)(1)(A); the CPPA publishes the figure), or buying, selling or sharing the personal
  information of **100,000 or more** California consumers or households, or making **50% or more**
  of revenue from selling or sharing personal information. Agental meets none of them today.
  We write the policy as if it applied, so nothing changes when it does.
  `LAWYER:` confirm Agental is outside the CCPA today, and when to re-check (revenue is tested on
  January 1 against the previous calendar year).
- **Security and fraud prevention is a recognized business purpose.** The definition of
  "business purpose" (Civ. Code § 1798.140(e)) includes helping to ensure security and integrity,
  to the extent the use of personal information is reasonably necessary and proportionate. The
  Privacy Policy states this purpose in plain words. `LAWYER:` check that the categories watched
  (above) are "reasonably necessary and proportionate" and that the policy lists them as
  categories.
- **Notice at collection and retention.** Civ. Code § 1798.100(a)(3) asks for the length of time
  each category is kept, or the criteria used to decide it. The policy now states: deleted
  accounts are kept 30 days, then removed; the email log is kept 180 days; backups are kept for a
  limited time (docs/BACKUPS.md); audit entries are kept with a hash of the email.
  `LAWYER:` the backup retention period in days, and whether audit entries need a stated period.
- **Deletion requests.** A performer can delete their own account in Settings (immediate, no
  30-day hold). The 30-day hold applies only to a deletion by staff. `LAWYER:` whether the 30-day
  hold after a staff deletion is acceptable when the person also asked to be deleted.
- **Automated decisionmaking (ADMT).** The CPPA's ADMT regulations (compliance from January 1,
  2027) cover technology that replaces or substantially replaces human decisions, including
  significant decisions about employment and independent contracting opportunities. Casting work
  may fall in that area. Today every suspension or deletion is decided by a person, so the rules
  should not be triggered. `LAWYER:` confirm, and note that the AI role matching (round 9, group
  4) ranks roles for the performer and decides nothing about them; check whether that ranking is
  ADMT.

### 2. CalOPPA (Cal. Bus. & Prof. Code §§ 22575 to 22579)

Any commercial website that collects personally identifiable information from California
residents must post a privacy policy that lists the categories collected, the third parties it is
shared with, how users are told of changes, its effective date, and how the site answers "Do Not
Track" signals. The policy has an effective date and a "Changes" section.
`LAWYER:` add the Do Not Track statement (we use no tracking cookies today).

### 3. FTC Act § 5 (unfair or deceptive practices)

The policy must describe what Agental actually does. If the policy says staff decide, staff must
decide; if it says 30 days, the purge must wait 30 days (it does: `src/domain/account-removal.ts`).

### 4. Notice before deletion

No general US or California statute we found requires notice before a service closes a free
account that breaks its terms. It is a matter of contract (the Terms) and of fairness (FTC).
The admin can send the 7-day warning, and the founders use it when they want to; the Terms say
that we may delete an account that breaks them, with or without notice.
`LAWYER:` whether a notice should be required before deleting an account that never broke the
Terms (for example an unverified account), and whether "with or without notice" is enforceable
for a paid account (paid accounts cannot be deleted by staff today).

### 5. Minors (COPPA, California Age-Appropriate Design Code)

Agental handles minors' profiles through a guardian (Admin > Minors). Monitoring signals for a
minor's account are the same as for an adult's. `LAWYER:` whether monitoring a minor's account
needs any extra notice to the guardian.

## Sources

- Civ. Code § 1798.140, definitions including "business purpose":
  https://california.public.law/codes/ca_civ_code_section_1798.140
- CPPA, updated monetary thresholds: https://www.cppa.ca.gov/regulations/cpi_adjustment.html
- CPPA regulations text (cybersecurity audits, risk assessments, ADMT):
  https://cppa.ca.gov/regulations/pdf/ccpa_updates_cyber_risk_admt_appr_text.pdf
- Littler, final ADMT regulations:
  https://littler.com/news-analysis/asap/californias-long-awaited-final-regulations-automated-decisionmaking-create-new

## Round 11 (2026-11-24): consent records

What changed, and what counsel should confirm:

- **Sign-up checkbox.** Creating an account with an email and password now requires ticking
  "I agree to the Privacy Policy" (and "the Terms of Service" once they are published with
  `TERMS_PAGE_ENABLED`). The box is not pre-ticked. The account records the date and the version
  (`privacyAcceptedAt`, `privacyVersion`; `termsAcceptedAt`, `termsVersion`; versions in
  `src/domain/legal-versions.ts`). The server refuses a sign-up without it.
  `LAWYER:` whether a checkbox ("clickwrap") with a link to the policy is enough, or whether the
  policy must also be shown in full before the click.
- **Google sign-ups and older accounts.** They accept once, on a screen shown before the app
  opens, at their next sign-in (same box, same record, audited as `legal.accepted`). Until they
  tick it, they cannot use the app; they can still sign out.
  `LAWYER:` whether blocking the app until acceptance is fine for accounts created before the
  policy said this, or whether those accounts need a notice period first.
- **Deleting unverified or abusive accounts.** The Privacy Policy, section "Account security and
  abuse" (anchor `#security`), now says in one paragraph that we may limit, suspend or delete an
  account that is fake, abusive or used for spam, breaks the Terms, or whose email address was
  never verified, and that we may email first with a 7-day notice. The paragraph is linked from
  the cookie banner ("How we protect accounts") and from the sign-up checkbox.
  `LAWYER:` whether deleting an account only because its email was never verified needs the
  7-day notice every time (today it is "may").
- **Cookie choice asked again.** Signed-in accounts with no cookie choice recorded on the account
  (11 at the end of round 10) see the cookie banner again; the answer is saved on the account
  with its date and notice version (`consent.update` in the audit log).
- **What the admin shows.** Admin > Accounts and each account page: the cookie choice and
  "Privacy Policy accepted: date, version" side by side, with filters (accepted or not, version)
  and both in the CSV exports. Dates are shown in Los Angeles time.
  `LAWYER:` how long these acceptance records must be kept after an account is deleted (today they
  go with the account row after the 30-day hold; the audit entry stays with a hash of the email).
