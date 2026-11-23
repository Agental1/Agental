import enApp from "../../messages/en/app.json";
import frApp from "../../messages/fr/app.json";
import esApp from "../../messages/es/app.json";
import zhApp from "../../messages/zh/app.json";
import { LANG_TAG, toLocale, type Locale } from "@/i18n/routing";

/**
 * The two account emails: confirm an address, reset a password.
 *
 * The wording lives in messages/<locale>/app.json under `emails`, next to the
 * rest of the signed-in application, and is read straight from the JSON files:
 * an email is built outside any request that next-intl knows about. English
 * defines the key set, so a locale missing one of these strings fails
 * `bun run typecheck`.
 *
 * Each email is one heading, one sentence, one link, and three short lines.
 * The link is the only URL in the message: no image, no tracking pixel, no
 * second link for a filter to distrust. Every value placed in the HTML is
 * escaped, the link included.
 */

type EmailStrings = (typeof enApp)["emails"];

const STRINGS: Record<Locale, EmailStrings> = {
  en: enApp.emails,
  fr: frApp.emails,
  es: esApp.emails,
  zh: zhApp.emails,
};

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

interface EmailParts {
  subject: string;
  intro: string;
  action: string;
  expiry: string;
  ignore: string;
  signature: string;
}

/** Escape a value for HTML text and for a double-quoted attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The link as the URL parser writes it back: spaces, quotes and line breaks
 * come out percent-encoded or removed. Only http and https are accepted, so a
 * `javascript:` address can never reach the href.
 */
function safeLink(link: string): string {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new Error("An email link must be an absolute URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("An email link must use http or https.");
  }
  return url.href;
}

const FONT =
  "font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

function render(locale: Locale, parts: EmailParts, rawLink: string): EmailContent {
  const link = safeLink(rawLink);

  const text = [
    parts.intro,
    "",
    parts.action,
    link,
    "",
    parts.expiry,
    parts.ignore,
    "",
    parts.signature,
    "",
  ].join("\n");

  const e = escapeHtml;
  const html = [
    "<!doctype html>",
    `<html lang="${e(LANG_TAG[locale])}" dir="ltr">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${e(parts.subject)}</title>`,
    "</head>",
    `<body style="margin:0;padding:24px;background:#ffffff;color:#111111;${FONT};font-size:16px;line-height:1.5">`,
    '<div style="max-width:480px;margin:0 auto">',
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${e(parts.subject)}</h1>`,
    `<p style="margin:0 0 24px">${e(parts.intro)}</p>`,
    `<p style="margin:0 0 24px"><a href="${e(link)}" style="display:inline-block;padding:14px 24px;border-radius:6px;background:#111111;color:#ffffff;font-weight:600;text-decoration:none">${e(parts.action)}</a></p>`,
    `<p style="margin:0 0 8px;color:#444444">${e(parts.expiry)}</p>`,
    `<p style="margin:0 0 24px;color:#444444">${e(parts.ignore)}</p>`,
    `<p style="margin:0">${e(parts.signature)}</p>`,
    "</div>",
    "</body>",
    "</html>",
    "",
  ].join("\n");

  return { subject: parts.subject, text, html };
}

/** "Confirm your email address", in the user's language. English otherwise. */
export function verificationEmail(locale: string, link: string): EmailContent {
  const resolved = toLocale(locale);
  const s = STRINGS[resolved];
  return render(
    resolved,
    {
      subject: s.verifySubject,
      intro: s.verifyIntro,
      action: s.verifyAction,
      expiry: s.verifyExpiry,
      ignore: s.ignore,
      signature: s.signature,
    },
    link
  );
}

/** "Reset your password", in the user's language. English otherwise. */
export function passwordResetEmail(locale: string, link: string): EmailContent {
  const resolved = toLocale(locale);
  const s = STRINGS[resolved];
  return render(
    resolved,
    {
      subject: s.resetSubject,
      intro: s.resetIntro,
      action: s.resetAction,
      expiry: s.resetExpiry,
      ignore: s.ignore,
      signature: s.signature,
    },
    link
  );
}

/** "Confirm your school email" for the college student discount. */
export function studentEmail(locale: string, link: string): EmailContent {
  const resolved = toLocale(locale);
  const s = STRINGS[resolved];
  return render(
    resolved,
    {
      subject: s.studentSubject,
      intro: s.studentIntro,
      action: s.studentAction,
      expiry: s.studentExpiry,
      ignore: s.ignore,
      signature: s.signature,
    },
    link
  );
}

/**
 * "Verify your email within N days or your account will be deleted", for an
 * unverified account on the admin's cleanup list. The link is the usual
 * confirmation link; confirming keeps the account.
 */
export function deletionWarningEmail(locale: string, link: string, days: number): EmailContent {
  const resolved = toLocale(locale);
  const s = STRINGS[resolved];
  const n = String(days);
  return render(
    resolved,
    {
      subject: s.deletionSubject.replace("{days}", n),
      intro: s.deletionIntro.replace("{days}", n),
      action: s.verifyAction,
      expiry: s.deletionExpiry.replace("{days}", n),
      ignore: s.deletionIgnore,
      signature: s.signature,
    },
    link
  );
}

/**
 * Round 9: the confirmation to the person who asked for a Limelight portfolio
 * site. It repeats their reference and links to the public Limelight page;
 * nothing else about the request is in it.
 */
export function limelightConfirmationEmail(locale: string, reference: string, link: string): EmailContent {
  const resolved = toLocale(locale);
  const s = STRINGS[resolved];
  return render(
    resolved,
    {
      subject: s.limelightSubject,
      intro: s.limelightIntro,
      action: s.limelightAction,
      expiry: s.limelightReference.replace("{reference}", reference),
      ignore: s.limelightIgnore,
      signature: s.signature,
    },
    link
  );
}

/**
 * Round 8b: the 6-digit code that verifies a @usc.edu address. No link: the
 * code is typed into the six boxes in the app.
 */
export function promoCodeEmail(locale: string, code: string): EmailContent {
  const resolved = toLocale(locale);
  const s = STRINGS[resolved];
  const clean = code.replace(/\D/g, "").slice(0, 6);
  const text = [s.codeIntro, "", clean, "", s.codeExpiry, s.ignore, "", s.signature, ""].join("\n");
  const e = escapeHtml;
  const html = [
    "<!doctype html>",
    `<html lang="${e(LANG_TAG[resolved])}" dir="ltr">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${e(s.codeSubject)}</title>`,
    "</head>",
    `<body style="margin:0;padding:24px;background:#ffffff;color:#111111;${FONT};font-size:16px;line-height:1.5">`,
    '<div style="max-width:480px;margin:0 auto">',
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${e(s.codeSubject)}</h1>`,
    `<p style="margin:0 0 16px">${e(s.codeIntro)}</p>`,
    `<p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:8px">${e(clean)}</p>`,
    `<p style="margin:0 0 8px;color:#444444">${e(s.codeExpiry)}</p>`,
    `<p style="margin:0 0 24px;color:#444444">${e(s.ignore)}</p>`,
    `<p style="margin:0">${e(s.signature)}</p>`,
    "</div>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
  return { subject: s.codeSubject, text, html };
}
