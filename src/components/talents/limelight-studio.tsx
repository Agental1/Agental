"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { TemplateArt } from "@/components/talents/template-art";
import { SamplePortfolio } from "@/components/talents/sample-portfolio";
import {
  LIMELIGHT_DRAFT_KEY,
  LIMELIGHT_TEMPLATES,
  siteSlug,
  type LimelightDraft,
  type LimelightTemplateId,
} from "@/data/limelight-templates";
import { cn } from "@/lib/utils";

type Item = { name: string; fit: string; performer: string; role: string };

function readDraft(): LimelightDraft | null {
  try {
    const raw = window.localStorage.getItem(LIMELIGHT_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<LimelightDraft>;
    if (draft.v !== 1 || !LIMELIGHT_TEMPLATES.includes(draft.template as LimelightTemplateId)) return null;
    return {
      v: 1,
      template: draft.template as LimelightTemplateId,
      name: String(draft.name ?? "").slice(0, 80),
      headline: String(draft.headline ?? "").slice(0, 120),
    };
  } catch {
    return null;
  }
}

/**
 * The Limelight templates and "Try it", as one piece of state.
 *
 *   - The row: every template as a card you scroll sideways. A card opens a
 *     full-screen preview with "Use this template".
 *   - Try it: pick a template, type a name and a headline, and the site
 *     appears as you type. No account is needed for any of that.
 *
 * "Save my site" keeps the draft on the visitor's device and sends them to
 * create an account; the draft is still there afterwards.
 * TODO(backend): once `saveSite` lands (src/app/actions/sites.ts), the signed-in
 * side reads this draft and stores it on the account.
 *
 * `variant="row"` renders the row alone, for the shorter blocks elsewhere.
 */
export function LimelightStudio({
  domain,
  accountHref,
}: {
  /** e.g. "agental.site" */
  domain: string;
  /** Where "Save my site" sends a visitor who has no account. */
  accountHref: string;
}) {
  const t = useTranslations("talents.limelight");
  const ts = useTranslations("talents.limelight.sample");
  const items = t.raw("templates.items") as Item[];
  const router = useRouter();
  const id = useId();

  const [template, setTemplate] = useState<LimelightTemplateId>(LIMELIGHT_TEMPLATES[0]);
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [preview, setPreview] = useState<number | null>(null);
  // The card that opened the preview, so closing it returns focus there.
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const [saved, setSaved] = useState(false);

  // A draft from an earlier visit, or from before the account was created.
  useEffect(() => {
    const draft = readDraft();
    if (!draft) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from localStorage after hydration
    setTemplate(draft.template);
    setName(draft.name);
    setHeadline(draft.headline);
  }, []);

  const shownName = name.trim() || t("try.namePlaceholder");
  const shownHeadline = headline.trim() || t("try.headlinePlaceholder");

  function use(index: number) {
    setTemplate(LIMELIGHT_TEMPLATES[index]);
    setPreview(null);
    document.getElementById("try")?.scrollIntoView({ block: "start" });
  }

  function save() {
    const draft: LimelightDraft = { v: 1, template, name: name.trim(), headline: headline.trim() };
    try {
      window.localStorage.setItem(LIMELIGHT_DRAFT_KEY, JSON.stringify(draft));
      setSaved(true);
    } catch {
      // Private mode or a full quota: the account step still works, the draft is retyped.
    }
    router.push(accountHref);
  }

  return (
    <>
      {/* ------------------------------------------------------------ row -- */}
      <section aria-labelledby={`${id}-row`} className="border-t border-border">
        <div className="mx-auto max-w-site px-[clamp(16px,3vw,40px)] pt-[clamp(36px,4.5vw,64px)]">
          <h2 id={`${id}-row`} className="display-md">
            {t("templates.title")}
          </h2>
          <p className="mt-3 max-w-[62ch] text-fg-muted">{t("templates.lead")}</p>
        </div>
        <ul className="ll-sheet-track mx-auto mt-6 flex max-w-site gap-3 px-[clamp(16px,3vw,40px)] pb-4">
          {items.map((item, i) => (
            <li key={item.name} className="w-[min(78vw,20rem)] shrink-0 snap-start">
              <button
                type="button"
                onClick={(e) => {
                  openerRef.current = e.currentTarget;
                  setPreview(i);
                }}
                aria-label={t("row.open", { name: item.name })}
                className={cn(
                  "pressable block w-full overflow-hidden rounded-sedan-xl border bg-surface text-left [--hover-scale:1.02] [--press-scale:1.04]",
                  LIMELIGHT_TEMPLATES[i] === template ? "border-accent" : "border-border"
                )}
              >
                <TemplateArt template={LIMELIGHT_TEMPLATES[i]} name={ts("name")} headline={ts("role")} />
                <span className="block p-4">
                  <span className="block font-bold">{item.name}</span>
                  <span className="mt-0.5 block text-[14px] text-fg-muted">{item.fit}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mx-auto max-w-site px-[clamp(16px,3vw,40px)] pb-[clamp(28px,3.5vw,48px)] text-[13px] text-fg-subtle">
          {t("row.hint")}
        </p>
      </section>

      {/* Full-screen preview of one template. */}
      <DialogPrimitive.Root open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <DialogPrimitive.Content
            data-portal="talents"
            aria-describedby={undefined}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              openerRef.current?.focus();
            }}
            className="enter fixed inset-2 z-50 flex flex-col overflow-hidden rounded-sedan-2xl border border-border bg-surface bg-none text-fg shadow-xl outline-none sm:inset-6"
          >
            {preview !== null && (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
                  <div className="min-w-0">
                    <DialogPrimitive.Title className="truncate text-[1.25rem] font-bold">
                      {ts("dialogTitle", { template: items[preview].name })}
                    </DialogPrimitive.Title>
                    <p className="truncate text-[14px] text-fg-muted">{items[preview].fit}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button onClick={() => use(preview)}>{t("row.use")}</Button>
                    <DialogPrimitive.Close
                      aria-label={t("row.close")}
                      className="pressable inline-flex size-11 items-center justify-center rounded-full border border-border text-fg"
                    >
                      <X aria-hidden="true" className="size-5" />
                    </DialogPrimitive.Close>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto bg-surface-2 p-3 sm:p-6">
                  <SamplePortfolio
                    template={LIMELIGHT_TEMPLATES[preview]}
                    className="mx-auto max-w-[72rem]"
                  />
                </div>
              </>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* --------------------------------------------------------- try it -- */}
      <section id="try" aria-labelledby={`${id}-try`} className="scroll-mt-24 border-t border-border">
        <div className="mx-auto grid max-w-site gap-[clamp(24px,4vw,56px)] px-[clamp(16px,3vw,40px)] py-[clamp(36px,4.5vw,64px)] lg:grid-cols-[1fr_1.25fr] lg:items-start">
          <div>
            <h2 id={`${id}-try`} className="display-md">
              {t("try.title")}
            </h2>
            <p className="mt-3 max-w-[48ch] text-fg-muted">{t("try.lead")}</p>

            <div className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-name`}>{t("try.name")}</Label>
                <Input
                  id={`${id}-name`}
                  value={name}
                  maxLength={80}
                  autoComplete="name"
                  placeholder={t("try.namePlaceholder")}
                  onChange={(e) => setName(e.target.value)}
                  className="h-[52px] px-4 text-base sm:h-[52px] sm:text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-headline`}>{t("try.headline")}</Label>
                <Input
                  id={`${id}-headline`}
                  value={headline}
                  maxLength={120}
                  placeholder={t("try.headlinePlaceholder")}
                  onChange={(e) => setHeadline(e.target.value)}
                  className="h-[52px] px-4 text-base sm:h-[52px] sm:text-base"
                />
              </div>
              <fieldset>
                <legend className="text-sm font-medium">{t("try.template")}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {items.map((item, i) => {
                    const active = LIMELIGHT_TEMPLATES[i] === template;
                    return (
                      <label
                        key={item.name}
                        className={cn(
                          "pressable inline-flex h-11 cursor-pointer items-center rounded-full border px-4 text-[14.5px] font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)]",
                          active ? "cta-fill border-transparent" : "border-border-strong bg-surface text-fg"
                        )}
                      >
                        <input
                          type="radio"
                          name={`${id}-template`}
                          className="sr-only"
                          checked={active}
                          onChange={() => setTemplate(LIMELIGHT_TEMPLATES[i])}
                        />
                        {item.name}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button size="lg" onClick={save}>
                {t("try.save")}
              </Button>
              <p role="status" className="max-w-[40ch] text-[14px] text-fg-muted">
                {saved ? t("try.saved") : t("try.saveNote")}
              </p>
            </div>
          </div>

          <figure className="min-w-0 lg:sticky lg:top-28">
            <div className="ll-frame">
              <div className="flex items-center gap-3 border-b border-border bg-surface-2 px-4 py-2.5">
                <span aria-hidden="true" className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-border-strong/50" />
                  <span className="size-2.5 rounded-full bg-border-strong/50" />
                  <span className="size-2.5 rounded-full bg-border-strong/50" />
                </span>
                <span className="min-w-0 flex-1 truncate rounded-full bg-surface px-3 py-1 text-[12.5px] text-fg-muted">
                  <span className="sr-only">{t("try.address")}: </span>
                  {siteSlug(name)}.{domain}
                </span>
              </div>
              <TemplateArt template={template} name={shownName} headline={shownHeadline} />
            </div>
          </figure>
        </div>
      </section>
    </>
  );
}
