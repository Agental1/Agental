# Go-live checklist: switching production from test mode to live

Round 9, group 9 (2026-11-22). Production runs in **test mode** today: `WORKFLOW_MODE` is not set,
so the AI searches, the assistant's model, the automatic emails and the texts reach **Test accounts
only**, and both n8n workflows are inactive. This page is the list to finish before the founder
switches to live, then the exact steps. **Only the founder makes the switch.** The agent never sets
`WORKFLOW_MODE` and never activates a workflow.

Tick every line. If one cannot be ticked, do not switch.

## 1. Legal

- [ ] The Terms of Service (`docs/legal/TERMS_DRAFT.md`) reviewed by the lawyer, every `LAWYER:`
      point answered, and published (`TERMS_PAGE_ENABLED=true` in Vercel, then check
      www.agental.co/en/talents/conditions).
- [ ] The Privacy Policy reviewed by the lawyer (account security and abuse, cookies, retention,
      texts), including `docs/legal/ACCOUNT_MONITORING.md`.
- [ ] The text-message consent wording reviewed (TCPA), if texts will be on.

## 2. Keys, DNS and budgets (docs/HANDOFF.md, "Waiting for Jérôme")

- [ ] Resend: domain verified, `RESEND_API_KEY`, `EMAIL_FROM` = `Agental <contact@agental.co>`,
      `RESEND_WEBHOOK_SECRET` (W1 to W3).
- [ ] `CRON_SECRET` in Vercel (W6) and in GitHub Actions with the hourly workflow in place (W16).
- [ ] `N8N_SHARED_SECRET` in Production and the `Agental app (production)` credential in n8n (W8).
- [ ] `ANTHROPIC_API_KEY` (W10), with the Anthropic Console monthly limit set ($50 proposed).
- [ ] OpenAI monthly budget set at platform.openai.com ($50 proposed); Perplexity auto top-up off,
      balance about $20 (W11).
- [ ] Admin dashboard, AI accounts card: a monthly budget typed for each provider, so the 80% alert
      works (Admin > AI accounts then shows the share used).
- [ ] admin.agental.co answers over HTTPS and only to admins with two-factor (W4).

## 3. Every email tested (docs/EMAILS.md)

- [ ] Each row of `docs/EMAILS.md` tested on production with a Test account and an address the
      founder controls, the result written (inbox or spam) with the date.
- [ ] Admin > Emails shows them as delivered (the Resend webhook works).
- [ ] The D3 test passed (W13): one reply, in the original thread, after a click on Send.

## 4. Every test passed

- [ ] Provider test in n8n (`mode` = `providers`): OpenAI, Perplexity Search, Perplexity Context and
      Gmail green.
- [ ] The casting search end to end on staging with the three fictional performers, then on
      production with Test accounts: claim, ranked roles with sources and "Get more details",
      drafts, cost per provider in Admin > Applications and AI jobs, no search over its ceiling.
- [ ] The assistant on a Test account: the seven injection prompts in `docs/ASSISTANT.md` give the
      expected answers (results written there).
- [ ] The automatic emails approved one by one in Admin > Controls and received by a Test account.
- [ ] The full test suite passes on the commit being deployed.

## 5. The pause switch tested

- [ ] Admin > Controls > Pause everything: a Test account's search stays queued, the assistant
      answers in rules mode, no automatic email or text goes out, the Direct Replies workflow
      drafts nothing. Admin > Audit shows the pause. Then Resume, and each starts again.

## 6. Accounts

- [ ] Junk accounts deleted or marked Spam in Admin > Accounts.
- [ ] The demo account with the admin role (W14) fixed.
- [ ] Decide which Test accounts stay Test (a Test account never runs in live mode).

## The switch (founder only)

1. In Vercel > agental > Settings > Environment Variables, add `WORKFLOW_MODE` = `live` for
   **Production** only. Save.
2. Redeploy production (Vercel > Deployments > the current one > Redeploy), or ask the agent to
   redeploy. The variable is read when the site starts: nothing changes before the redeploy.
3. In n8n, open "Agental Beta V2 - Direct Replies" (and "Beta V2" if it was unarchived): check the
   app nodes point at **https://www.agental.co/api/n8n/...** with the production credential and no
   bypass header, set "Beta Test Settings" `mode` to the live value, then click **Active** (top
   right) on each workflow.
4. Within the next hour: Admin > Applications and AI jobs shows searches claimed; Admin > Emails
   shows emails sent; Admin > Replies to approve fills as emails arrive.
5. If anything looks wrong: Admin > Controls > **Pause everything** (immediate), then tell the agent.

## Going back to test mode

Remove `WORKFLOW_MODE` (or set it to anything but `live`), redeploy, and set the two workflows
inactive in n8n. The pause switch works at any time without a redeploy.
