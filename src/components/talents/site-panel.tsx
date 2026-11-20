"use client";

import { useId, useState, useSyncExternalStore, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  approveSitePreview,
  saveSite,
  setSiteContactVisibility,
  unpublishSite,
} from "@/app/actions/sites";
import { ActionErrorMessage } from "@/components/app/action-error";
import { Button } from "@/components/ui/button";
import { LimelightContactForm } from "@/components/talents/limelight-contact-form";
import { TemplateArt } from "@/components/talents/template-art";
import {
  LIMELIGHT_DRAFT_KEY,
  LIMELIGHT_TEMPLATES,
  type LimelightDraft,
  type LimelightTemplateId,
} from "@/data/limelight-templates";
import { err, type ActionError } from "@/domain/action-result";

export interface SiteCard {
  id: string;
  template: string;
  name: string;
  headline: string;
  /** Online now (with the published revision). */
  live: boolean;
  address: string | null;
  hostingUntil: string | null;
  /** Newest saved revision: the preview shown here. Null before revisions existed. */
  latestVersion: number | null;
  /** The revision the performer approved, null until they approve one. */
  approvedVersion: number | null;
  /** The revision the public sees, null while offline. */
  publishedVersion: number | null;
  showContact: boolean;
}

/**
 * The one step a site is at. Approval is the performer's; publishing puts
 * the approved revision online. A live site with newer edits needs a new
 * approval, then a new publish.
 */
function stepsOf(site: SiteCard) {
  const needsApproval =
    site.approvedVersion === null ||
    (site.latestVersion !== null && site.approvedVersion !== site.latestVersion);
  const canPublish =
    site.approvedVersion !== null && (!site.live || site.publishedVersion !== site.approvedVersion);
  return { needsApproval, canPublish };
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
function draftSnapshot(): string | null {
  try {
    return window.localStorage.getItem(LIMELIGHT_DRAFT_KEY);
  } catch {
    return null;
  }
}
function parseDraft(raw: string | null): LimelightDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<LimelightDraft>;
    if (d.v !== 1 || !d.name?.trim()) return null;
    if (!LIMELIGHT_TEMPLATES.includes(d.template as LimelightTemplateId)) return null;
    return { v: 1, template: d.template as LimelightTemplateId, name: d.name, headline: d.headline ?? "" };
  } catch {
    return null;
  }
}
const asTemplate = (id: string): LimelightTemplateId =>
  LIMELIGHT_TEMPLATES.includes(id as LimelightTemplateId) ? (id as LimelightTemplateId) : "marquee";

/**
 * "Your website" in the Talent app: each site with its status and the next
 * step (approve the preview, publish, take offline), the contact details
 * switch, and the draft a performer typed in "Try it" before they had an
 * account.
 *
 * Payments are off during the beta: nothing here sells an offer, and the
 * team helps with publishing.
 */
export function SitePanel({
  sites,
  tryHref,
  contact,
}: {
  sites: SiteCard[];
  tryHref: string;
  /** The signed-in performer, to prefill the request form. */
  contact: { name: string; email: string };
}) {
  const t = useTranslations("talents.limelight.app");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ActionError | undefined>();
  const [requestFor, setRequestFor] = useState<string | null>(null);
  const draft = parseDraft(useSyncExternalStore(subscribe, draftSnapshot, () => null));

  function run(action: () => Promise<{ ok: boolean; error?: ActionError }>, after?: () => void) {
    setError(undefined);
    start(async () => {
      try {
        const res = await action();
        if (!res.ok) {
          const failure = res.error ?? err("errors.generic");
          setError(failure);
          // Someone saved since this page was rendered: show the new preview.
          if (failure.key === "errors.sitePreviewChanged") router.refresh();
          return;
        }
        after?.();
        router.refresh();
      } catch {
        setError(err("errors.generic"));
      }
    });
  }

  function keepDraft() {
    if (!draft) return;
    run(
      () => saveSite({ template: draft.template, content: { name: draft.name.trim(), headline: draft.headline.trim() || undefined } }),
      () => {
        try {
          window.localStorage.removeItem(LIMELIGHT_DRAFT_KEY);
          window.dispatchEvent(new StorageEvent("storage", { key: LIMELIGHT_DRAFT_KEY }));
        } catch {
          // Nothing to clean up if storage is unavailable.
        }
      }
    );
  }

  return (
    <div className="space-y-4">
      <ActionErrorMessage error={error} />

      {draft && (
        <div className="accent-wash flex flex-col gap-4 rounded-sedan-xl border border-accent/50 bg-surface p-5 sm:flex-row sm:items-center">
          <div className="ll-frame w-full shrink-0 sm:w-56">
            <TemplateArt template={draft.template} name={draft.name} headline={draft.headline} />
          </div>
          <div className="flex-1">
            <p className="font-bold">{draft.name}</p>
            <p className="mt-0.5 text-[15px] text-fg-muted">{t("fromDraft")}</p>
            <Button className="mt-3" disabled={pending} onClick={keepDraft}>
              {t("saveDraft")}
            </Button>
          </div>
        </div>
      )}

      {sites.length === 0 && !draft && (
        <div className="rounded-sedan-xl border border-border bg-surface p-6">
          <p className="text-[1.125rem] font-bold">{t("empty")}</p>
          <Button asChild className="mt-4">
            <Link href={tryHref}>{t("emptyCta")}</Link>
          </Button>
        </div>
      )}

      {sites.map((site) => {
        const { needsApproval, canPublish } = stepsOf(site);
        return (
          <div key={site.id} className="space-y-3">
          <article className="flex flex-col gap-4 rounded-sedan-xl border border-border bg-surface p-5 sm:flex-row">
            <div className="ll-frame w-full shrink-0 self-start sm:w-64">
              <TemplateArt template={asTemplate(site.template)} name={site.name} headline={site.headline} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[1.25rem]">{site.name}</h2>
              <p className="mt-1 text-[15px] font-bold text-accent">
                {site.live
                  ? site.address
                    ? t("published", { address: site.address })
                    : t("live")
                  : canPublish
                    ? t("approved")
                    : t("draft")}
              </p>
              {/* A site published before revisions existed has no published
                  version: nothing newer is waiting, it only needs one approval. */}
              {site.live && needsApproval && site.publishedVersion !== null && (
                <p className="mt-1 text-[14px] text-fg-muted">{t("pendingChanges")}</p>
              )}
              {!site.live && needsApproval && (
                <p className="mt-1 text-[14px] text-fg-muted">{t("approveHint")}</p>
              )}
              {site.hostingUntil && (
                <p className="mt-1 text-[14px] text-fg-muted">{t("hostingUntil", { date: site.hostingUntil })}</p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {needsApproval && (
                  <Button
                    variant={canPublish ? "secondary" : "primary"}
                    className={canPublish ? "border-border-strong" : undefined}
                    disabled={pending}
                    onClick={() =>
                      run(() => approveSitePreview(site.id, site.latestVersion ?? undefined))
                    }
                  >
                    {t("approve")}
                  </Button>
                )}
                {/* Beta: the team publishes. The performer sends a request. */}
                <Button
                  variant={needsApproval ? "secondary" : "primary"}
                  className={needsApproval ? "border-border-strong" : undefined}
                  aria-expanded={requestFor === site.id}
                  disabled={pending}
                  onClick={() => setRequestFor(requestFor === site.id ? null : site.id)}
                >
                  {t("sendRequest")}
                </Button>
                {site.live && (
                  <Button
                    variant="secondary"
                    className="border-border-strong"
                    disabled={pending}
                    onClick={() => run(() => unpublishSite(site.id))}
                  >
                    {t("unpublish")}
                  </Button>
                )}
              </div>

              <ContactToggle
                checked={site.showContact}
                disabled={pending}
                onChange={(show) => run(() => setSiteContactVisibility(site.id, show))}
              />
            </div>
          </article>
          {requestFor === site.id && (
            <LimelightContactForm
              defaults={{
                name: contact.name,
                email: contact.email,
                message: t("requestMessage", {
                  name: site.name,
                  template: site.template,
                  version: site.latestVersion ?? 1,
                }),
              }}
              submitLabel={t("sendRequest")}
              preview={
                <div className="flex items-center gap-4">
                  <div className="ll-frame w-40 shrink-0">
                    <TemplateArt template={asTemplate(site.template)} name={site.name} headline={site.headline} />
                  </div>
                  <p className="text-[15px] text-fg-muted">{t("requestPreview", { name: site.name })}</p>
                </div>
              }
            />
          )}
          </div>
        );
      })}
    </div>
  );
}

function ContactToggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (show: boolean) => void;
}) {
  const t = useTranslations("talents.limelight.app");
  const hintId = useId();
  return (
    <label className="mt-4 flex items-start gap-3 border-t border-border pt-4">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-[var(--accent)]"
      />
      <span>
        <span className="text-[15px] font-medium">{t("contactLabel")}</span>
        <span id={hintId} className="block text-[14px] text-fg-muted">
          {t("contactHint")}
        </span>
      </span>
    </label>
  );
}
