"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { publishSite, saveSite, startSiteCheckout, unpublishSite } from "@/app/actions/sites";
import { ActionErrorMessage } from "@/components/app/action-error";
import { Button } from "@/components/ui/button";
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
  status: "draft" | "paid" | "published";
  address: string | null;
  hostingUntil: string | null;
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
 * "Your website" in the Talent app: each site with its status and the one
 * next step (choose an offer, publish, take offline), plus the draft a
 * performer typed in "Try it" before they had an account.
 *
 * Billing is the mock for now: an offer is paid at once in development and
 * answers "not available yet" in production.
 */
export function SitePanel({
  sites,
  offers,
  tryHref,
}: {
  sites: SiteCard[];
  offers: { offer: "essential" | "signature"; name: string; price: string }[];
  tryHref: string;
}) {
  const t = useTranslations("talents.limelight.app");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ActionError | undefined>();
  const draft = parseDraft(useSyncExternalStore(subscribe, draftSnapshot, () => null));

  function run(action: () => Promise<{ ok: boolean; error?: ActionError; checkoutUrl?: string }>, after?: () => void) {
    setError(undefined);
    start(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error ?? err("errors.generic"));
        return;
      }
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
      after?.();
      router.refresh();
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

      {sites.map((site) => (
        <article key={site.id} className="flex flex-col gap-4 rounded-sedan-xl border border-border bg-surface p-5 sm:flex-row">
          <div className="ll-frame w-full shrink-0 self-start sm:w-64">
            <TemplateArt template={asTemplate(site.template)} name={site.name} headline={site.headline} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[1.25rem]">{site.name}</h2>
            <p className="mt-1 text-[15px] font-bold text-accent">
              {site.status === "published" && site.address
                ? t("published", { address: site.address })
                : site.status === "paid"
                  ? t("paid")
                  : t("draft")}
            </p>
            {site.hostingUntil && (
              <p className="mt-1 text-[14px] text-fg-muted">{t("hostingUntil", { date: site.hostingUntil })}</p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {site.status === "draft" && (
                <>
                  <p className="w-full text-[14px] text-fg-muted">{t("chooseOffer")}</p>
                  {offers.map((o, i) => (
                    <Button
                      key={o.offer}
                      variant={i === 0 ? "primary" : "secondary"}
                      className={i === 0 ? undefined : "border-border-strong"}
                      disabled={pending}
                      onClick={() => run(() => startSiteCheckout({ siteId: site.id, offer: o.offer }))}
                    >
                      {t("buy", { name: o.name, price: o.price })}
                    </Button>
                  ))}
                </>
              )}
              {site.status === "paid" && (
                <Button disabled={pending} onClick={() => run(() => publishSite(site.id))}>
                  {t("publish")}
                </Button>
              )}
              {site.status === "published" && (
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
          </div>
        </article>
      ))}
    </div>
  );
}
