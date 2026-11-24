/**
 * Round 11: what an audit entry means, in words, for the account timeline in
 * the admin (it showed the raw keys, "auth.email.verified"). English, like the
 * admin's audit page and CSV exports. A key missing from the list is still
 * readable: "limelight.domain.add" becomes "Limelight: domain add".
 */
const LABELS: Record<string, string> = {
  "user.signup": "Signed up",
  "auth.email.verified": "Email verified",
  "auth.email.changed": "Email address changed (before verifying)",
  "auth.password.reset": "Password reset",
  "auth.oauth.link": "Google or Apple sign-in linked",
  "auth.oauth.link_takeover": "Google or Apple sign-in took over the account",
  "auth.oauth.unlink": "Google or Apple sign-in removed",
  "onboarding.complete": "Finished onboarding",
  "casting.onboarding.complete": "Finished onboarding (casting)",
  "consent.update": "Cookie choice changed",
  "agent.setup.save": "AI agent set up",
  "plan.choice": "Chose a plan",
  "subscription.change": "Plan changed",
  "workflow.intake": "Search request received",
  "profile.birthDate.change": "Date of birth changed",
  "profile.contentBoundaries.update": "Content boundaries updated",
  "profile.smsConsent.given": "Agreed to texts",
  "media.delete": "Deleted a file",
  "media.share.create": "Shared a file",
  "media.share.revoke": "Stopped sharing a file",
  "tape.delete": "Deleted a self-tape",
  "draft.review": "Reviewed a draft",
  "draft.media.attach": "Added a file to a draft",
  "draft.media.detach": "Removed a file from a draft",
  "application.submit": "Applied to a role",
  "application.accept": "Application accepted",
  "application.decline": "Application declined",
  "application.decline.undo": "Decline undone",
  "message.team.reply": "Team replied in Messages",
  "message.conversation.delete": "Deleted a conversation",
  "email.unsubscribe": "Unsubscribed from an email category",
  "promotion.usc.verified": "USC address verified",
  "student.email.verified": "School email verified",
  "student.code.created": "Student code created",
  "student.code.redeemed": "Student code used",
  "rgpd.export": "Downloaded their data",
  "rgpd.delete": "Asked to delete the account",
  "admin.account.status": "Staff changed the account group",
  "admin.account.type": "Staff changed the account type",
  "admin.account.warn": "Staff sent the cleanup warning",
  "admin.account.delete": "Staff deleted the account",
  "admin.account.restore": "Staff restored the account",
  "admin.account.purge": "Account erased for good",
  "admin.view.account": "Staff opened this account",
  "admin.mfa.fail": "Wrong admin two-factor code",
  "admin.reply.send": "Staff sent an email reply",
  "admin.reply.discard": "Staff discarded a drafted reply",
};

function humanize(action: string): string {
  const [area, ...rest] = action.split(".");
  const words = rest.join(" ").replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  const head = area ? area.charAt(0).toUpperCase() + area.slice(1) : action;
  return words ? `${head}: ${words}` : head;
}

export function auditLabel(action: string): string {
  return LABELS[action] ?? humanize(action);
}
