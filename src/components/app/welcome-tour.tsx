"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { completeFirstRun } from "@/app/actions/onboarding";
import { adoptProviderPhoto } from "@/app/actions/avatar";
import { Button } from "@/components/ui/button";

export interface WelcomeStep {
  title: string;
  body: string;
  /** Extra lines under the body (what Google filled in, for example). */
  notes?: string[];
  /** CSS selectors of the real elements this step points at. */
  targets: string[];
  /** Outlined instead when none of the targets is on the page. */
  fallback?: string;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The visible elements for a step, merged into one box (page coordinates). */
function boxFor(targets: string[]): { box: Box; first: Element } | null {
  const rects: DOMRect[] = [];
  let first: Element | null = null;
  for (const sel of targets) {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        rects.push(r);
        first ??= el;
      }
    }
  }
  if (!first || rects.length === 0) return null;
  const top = Math.min(...rects.map((r) => r.top));
  const left = Math.min(...rects.map((r) => r.left));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const right = Math.max(...rects.map((r) => r.right));
  return {
    first,
    box: { top: top - PAD, left: left - PAD, width: right - left + 2 * PAD, height: bottom - top + 2 * PAD },
  };
}

/**
 * The three-step welcome on the first sign-in: each step outlines the real
 * element on the page (the profile card, the green button, the menu entries).
 * Opens on `?welcome=1` (set for every new account, and by "Replay the tour"
 * in Settings); Skip or Done stamps the first run and removes the parameter.
 * Respects reduced motion: no smooth scroll and no transition.
 */
export function WelcomeTour({ steps, offerPhoto }: { steps: WelcomeStep[]; offerPhoto?: boolean }) {
  const t = useTranslations("common.tour");
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [photo, setPhoto] = useState<"idle" | "done" | "failed">("idle");
  const [pending, start] = useTransition();
  const cardRef = useRef<HTMLDivElement>(null);

  const open = params.get("welcome") === "1" && !dismissed && steps.length > 0;
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;

  const measure = useCallback(() => {
    if (!open) return;
    const found = boxFor(step.targets) ?? (step.fallback ? boxFor([step.fallback]) : null);
    setBox(found ? found.box : null);
  }, [open, step]);

  // Bring the element into view, then outline it.
  useLayoutEffect(() => {
    if (!open) return;
    const found = boxFor(step.targets) ?? (step.fallback ? boxFor([step.fallback]) : null);
    found?.first.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
    const first = window.requestAnimationFrame(measure);
    const id = window.setTimeout(measure, reducedMotion() ? 0 : 350);
    return () => {
      window.cancelAnimationFrame(first);
      window.clearTimeout(id);
    };
  }, [open, step, measure]);

  useEffect(() => {
    if (!open) return;
    // Capture: the app scrolls an inner panel, not only the window.
    window.addEventListener("resize", measure);
    document.addEventListener("scroll", measure, { passive: true, capture: true });
    // Smooth scrolling keeps moving for a moment after the step changes.
    const id = window.setInterval(measure, 250);
    return () => {
      window.removeEventListener("resize", measure);
      document.removeEventListener("scroll", measure, { capture: true });
      window.clearInterval(id);
    };
  }, [open, measure]);

  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open, index]);

  function close() {
    setDismissed(true);
    setIndex(0);
    void completeFirstRun();
    router.replace(pathname, { scroll: false });
  }

  if (!open) return null;
  // Keep the card off the outlined element: top when the element sits low.
  const cardAtTop = !!box && box.top + box.height / 2 > window.innerHeight / 2;
  const motion = reducedMotion() ? "" : "transition-all duration-300";

  return (
    <>
      {/* Dim the page; the outlined element shows through the hole. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40">
        {box ? (
          <div
            className={`absolute rounded-sedan ring-4 ring-[var(--go)] ${motion}`}
            style={{
              top: box.top,
              left: box.left,
              width: box.width,
              height: box.height,
              boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.45)",
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-black/45" />
        )}
      </div>

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="welcome-title"
        aria-describedby="welcome-body"
        tabIndex={-1}
        onKeyDown={(e) => e.key === "Escape" && close()}
        style={cardAtTop ? { top: 12 } : { bottom: 12 }}
        className="fixed inset-x-3 z-50 mx-auto max-w-md rounded-sedan-xl border border-border bg-surface p-5 shadow-2xl outline-none"
      >
        <p className="flex items-baseline gap-3 text-[14px]">
          <span className="font-bold text-accent">{t("welcome")}</span>
          <span className="text-fg-muted">{t("step", { n: index + 1, total: steps.length })}</span>
        </p>
        <h2 id="welcome-title" className="mt-1.5 text-[1.3rem] font-bold leading-tight">
          {step.title}
        </h2>
        <p id="welcome-body" className="mt-1.5 text-[15.5px] leading-relaxed text-fg-muted">
          {step.body}
        </p>
        {step.notes?.map((n) => (
          <p key={n} className="mt-1.5 text-[14.5px] font-medium">
            {n}
          </p>
        ))}
        {index === 0 && offerPhoto && photo !== "done" && (
          <Button
            variant="secondary"
            className="mt-3 border-border-strong"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await adoptProviderPhoto().catch(() => ({ ok: false as const }));
                setPhoto(res.ok ? "done" : "failed");
                if (res.ok) router.refresh();
              })
            }
          >
            {t("usePhoto")}
          </Button>
        )}
        {photo === "done" && <p className="mt-2 text-[14px] font-bold text-success">{t("photoSaved")}</p>}
        {photo === "failed" && <p className="mt-2 text-[14px] text-danger">{t("photoFailed")}</p>}

        <ol aria-hidden="true" className="mt-4 flex gap-1.5">
          {steps.map((s, i) => (
            <li key={s.title} className={i <= index ? "h-1.5 flex-1 rounded-full bg-accent" : "h-1.5 flex-1 rounded-full bg-surface-2"} />
          ))}
        </ol>
        <div className="mt-4 flex items-center justify-between gap-2">
          {index > 0 ? (
            <Button variant="secondary" className="border-border-strong" onClick={() => setIndex(index - 1)}>
              {t("back")}
            </Button>
          ) : (
            <Button variant="ghost" onClick={close}>
              {t("skip")}
            </Button>
          )}
          <Button onClick={() => (last ? close() : setIndex(index + 1))}>{last ? t("done") : t("next")}</Button>
        </div>
      </div>
    </>
  );
}
