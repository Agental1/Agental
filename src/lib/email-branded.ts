import { escapeHtml } from "@/lib/email-templates";
import { LANG_TAG, toLocale } from "@/i18n/routing";

/**
 * Round 9, group 6: the layout of the automatic emails, in the brand: the
 * Talent theme (white to pale blue, near-black text, electric blue accent),
 * Helvetica, the A monogram, plain English. One heading, a few short
 * paragraphs, an optional list, one button, then the footer: why this email
 * came, a one-click unsubscribe for its category and the email settings.
 * Every value is escaped; the only links are the button, the monogram's
 * home link, the unsubscribe and the settings.
 */
export interface BrandedEmail {
  locale: string;
  subject: string;
  /** The grey line mail apps show next to the subject. */
  preheader: string;
  heading: string;
  paragraphs: string[];
  items?: { title: string; detail?: string | null }[];
  cta: { label: string; url: string };
  footer: { why: string; unsubscribeLabel: string; unsubscribeUrl: string; settingsLabel: string; settingsUrl: string; signature: string };
  base: string;
}

const FONT = "font-family:Helvetica,Arial,sans-serif";
const ACCENT = "#246BFE";
const TEXT = "#0B1220";
const MUTED = "#4A5568";

function safeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
}

export function brandedEmail(e: BrandedEmail): { subject: string; text: string; html: string } {
  const locale = toLocale(e.locale);
  const x = escapeHtml;
  const cta = safeUrl(e.cta.url);
  const unsub = safeUrl(e.footer.unsubscribeUrl);
  const settings = safeUrl(e.footer.settingsUrl);
  const home = safeUrl(`${e.base}/${locale}`);
  const logo = safeUrl(`${e.base}/apple-icon`);

  const text = [
    e.heading,
    "",
    ...e.paragraphs.flatMap((p) => [p, ""]),
    ...(e.items?.length ? [...e.items.map((i) => `- ${i.title}${i.detail ? ` (${i.detail})` : ""}`), ""] : []),
    `${e.cta.label}: ${cta}`,
    "",
    e.footer.signature,
    "",
    e.footer.why,
    `${e.footer.unsubscribeLabel}: ${unsub}`,
    `${e.footer.settingsLabel}: ${settings}`,
    "",
  ].join("\n");

  const items = e.items?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-collapse:collapse">${e.items
        .map(
          (i) =>
            `<tr><td style="padding:12px 16px;border:1px solid #D6E4FF;border-radius:8px;background:#FFFFFF"><strong style="color:${TEXT}">${x(i.title)}</strong>${
              i.detail ? `<br><span style="color:${MUTED};font-size:14px">${x(i.detail)}</span>` : ""
            }</td></tr><tr><td style="height:8px;line-height:8px;font-size:0">&nbsp;</td></tr>`
        )
        .join("")}</table>`
    : "";

  const html = [
    "<!doctype html>",
    `<html lang="${x(LANG_TAG[locale])}" dir="ltr">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${x(e.subject)}</title>`,
    "</head>",
    `<body style="margin:0;padding:0;background:#EEF4FF;${FONT};color:${TEXT}">`,
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${x(e.preheader)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#FFFFFF 0%,#DCEAFF 100%);background-color:#EEF4FF">`,
    '<tr><td align="center" style="padding:32px 16px">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">',
    `<tr><td style="padding:0 0 24px"><a href="${x(home)}"><img src="${x(logo)}" width="40" height="40" alt="Agental" style="display:block;border:0;border-radius:8px"></a></td></tr>`,
    `<tr><td style="background:#FFFFFF;border-radius:16px;padding:32px;font-size:16px;line-height:1.55">`,
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;${FONT};color:${TEXT}">${x(e.heading)}</h1>`,
    ...e.paragraphs.map((p) => `<p style="margin:0 0 16px">${x(p)}</p>`),
    items,
    `<p style="margin:8px 0 24px"><a href="${x(cta)}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:${ACCENT};color:#FFFFFF;font-weight:bold;text-decoration:none">${x(e.cta.label)}</a></p>`,
    `<p style="margin:0">${x(e.footer.signature)}</p>`,
    "</td></tr>",
    `<tr><td style="padding:24px 8px 0;font-size:13px;line-height:1.5;color:${MUTED}">`,
    `<p style="margin:0 0 8px">${x(e.footer.why)}</p>`,
    `<p style="margin:0"><a href="${x(unsub)}" style="color:${MUTED}">${x(e.footer.unsubscribeLabel)}</a> &middot; <a href="${x(settings)}" style="color:${MUTED}">${x(e.footer.settingsLabel)}</a></p>`,
    "</td></tr>",
    "</table>",
    "</td></tr>",
    "</table>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
  return { subject: e.subject, text, html };
}
