"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AgentalMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { SITE } from "@/lib/seo";
import {
  DEMO_LOCALE,
  DEMO_START_PATH,
  runDemoScript,
  type DemoDriver,
  type EndCard,
} from "./demo-script";

/**
 * The `?demo` player: start screen, captions, chapter cards and end card on
 * top of the real pages, driven by `demo-script.ts`.
 *
 * Everything the camera sees between cards is the production UI — the player
 * only scrolls, highlights, types into and clicks the same elements a visitor
 * would. Elements are found by `data-demo="…"` hooks placed on the pages, so a
 * restyle does not break the tour as long as the hooks stay.
 *
 * Keys: click to start, R to restart, Esc to leave demo mode.
 *
 * Copy here is English only and not routed through next-intl: the tour is a
 * recording tool for one audience, and the product UI is going English-only
 * anyway. The tour forces /en so the captions and the page agree.
 */

type Caption = { text: string; tag?: string } | null;
type Card = { kicker: string; title: string } | null;

class DemoAborted extends Error {}

const HEADER_OFFSET = 96; // sticky marketing header + breathing room
const HOST = new URL(SITE).host;

export default function DemoPlayer() {
  const router = useRouter();
  const locale = useLocale();

  const [phase, setPhase] = useState<"start" | "running" | "end">("start");
  const [caption, setCaption] = useState<Caption>(null);
  const [card, setCard] = useState<Card>(null);
  const [end, setEnd] = useState<EndCard | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // The captions are English: send any other locale to the English start page
  // with a full load, so the root layout (and this player) mount fresh there.
  const wrongLocale = locale !== DEMO_LOCALE;
  useEffect(() => {
    if (wrongLocale) {
      window.location.replace(`/${DEMO_LOCALE}${DEMO_START_PATH}?demo`);
    }
  }, [wrongLocale]);

  // Hide the cursor and switch off smooth scrolling (it would fight the
  // frame-by-frame scroll tweens) while the tour plays.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.demo = phase;
    return () => {
      delete root.dataset.demo;
    };
  }, [phase]);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const { signal } = ctrl;

    const check = () => {
      if (signal.aborted) throw new DemoAborted();
    };
    const wait = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        const id = window.setTimeout(resolve, ms);
        signal.addEventListener(
          "abort",
          () => {
            window.clearTimeout(id);
            reject(new DemoAborted());
          },
          { once: true }
        );
      });
    const frame = () =>
      new Promise<number>((resolve) => requestAnimationFrame(resolve));

    const find = (sel: string) => document.querySelector<HTMLElement>(sel);
    const waitFor = async (sel: string, timeout = 10000) => {
      const t0 = performance.now();
      for (;;) {
        check();
        const el = find(sel);
        if (el) return el;
        if (performance.now() - t0 > timeout) {
          throw new Error(`[demo] element not found: ${sel}`);
        }
        await wait(50);
      }
    };

    const tween = async (ms: number, fn: (k: number) => void) => {
      const t0 = performance.now();
      for (;;) {
        check();
        const now = await frame();
        const k = Math.min(1, (now - t0) / ms);
        // ease-in-out quad
        fn(k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
        if (k >= 1) return;
      }
    };

    const targetY = (el: HTMLElement, align: "top" | "center") => {
      const r = el.getBoundingClientRect();
      const y =
        align === "center"
          ? r.top + window.scrollY - Math.max(HEADER_OFFSET, (window.innerHeight - r.height) / 2)
          : r.top + window.scrollY - HEADER_OFFSET;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return Math.max(0, Math.min(max, y));
    };
    const jump = (y: number) =>
      window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });

    let lit: HTMLElement[] = [];
    const unlight = () => {
      lit.forEach((el) => el.removeAttribute("data-demo-hl"));
      lit = [];
    };

    const driver: DemoDriver = {
      wait,
      say(text, tag) {
        setCaption(text ? { text, tag } : null);
      },
      async goto(path, readySelector) {
        check();
        if (window.location.pathname !== `/${DEMO_LOCALE}${path}`) {
          router.push(path, { locale: DEMO_LOCALE });
        }
        await waitFor(readySelector);
        await frame();
        jump(0);
      },
      async scrollTo(sel, ms = 900, align = "top") {
        if (sel === "top") {
          const y0 = window.scrollY;
          if (ms === 0) return jump(0);
          return tween(ms, (e) => jump(y0 * (1 - e)));
        }
        const el = await waitFor(sel);
        const y0 = window.scrollY;
        const y1 = targetY(el, align);
        if (ms === 0) return jump(y1);
        await tween(ms, (e) => jump(y0 + (y1 - y0) * e));
      },
      highlight(sel) {
        unlight();
        if (!sel) return;
        lit = Array.from(document.querySelectorAll<HTMLElement>(sel));
        lit.forEach((el) => el.setAttribute("data-demo-hl", ""));
      },
      async type(sel, given, ms = 1400) {
        const el = (await waitFor(sel)) as HTMLInputElement;
        const text = given ?? el.defaultValue;
        const setValue = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set;
        el.focus({ preventScroll: true });
        const step = ms / Math.max(1, text.length);
        for (let i = 0; i <= text.length; i++) {
          check();
          setValue?.call(el, text.slice(0, i));
          el.dispatchEvent(new Event("input", { bubbles: true }));
          await wait(step);
        }
      },
      async click(sel) {
        const el = await waitFor(sel);
        el.click();
        el.blur();
      },
      async chapter(kicker, title, ms, behind) {
        setCaption(null);
        setCard({ kicker, title });
        await wait(400); // card fully covers the page
        unlight();
        if (behind) await behind();
        await wait(Math.max(0, ms - 800));
        setCard(null);
        await wait(400);
      },
      finish(endCard) {
        unlight();
        setCaption(null);
        setEnd(endCard);
        setPhase("end");
      },
    };

    setEnd(null);
    setCard(null);
    setCaption(null);
    setPhase("running");
    try {
      await runDemoScript(driver);
    } catch (e) {
      unlight();
      if (!(e instanceof DemoAborted)) {
        // Surface a broken hook loudly in the console, but never strand the
        // recording on a half-finished frame.
        console.error(e);
        setCaption(null);
        setCard(null);
        setPhase("start");
      }
    }
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") {
        if (phase !== "start") void run();
      } else if (e.key === "Escape") {
        abortRef.current?.abort();
        // Full load without the query: unmounts the player for good.
        window.location.assign(window.location.pathname);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, run]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (wrongLocale) return null;

  return (
    <>
      {/* Start screen: the first click both dismisses it and starts the take,
          so the recording can begin on a clean black frame. */}
      {phase === "start" && (
        <button
          type="button"
          onClick={() => void run()}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-surface-inverse px-6 text-center text-fg-inverse"
        >
          <AgentalMark className="h-14 w-auto text-cta" />
          <span className="text-[clamp(36px,5vw,56px)] font-bold leading-none tracking-[0.18em]">
            AGENTAL
          </span>
          <span className="font-mono text-[13px] uppercase tracking-[0.08em] text-fg-inverse-muted">
            Demo mode · start recording, then click anywhere · about 35 seconds
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-fg-inverse-muted/70">
            R restart · Esc exit
          </span>
        </button>
      )}

      {/* Caption bar */}
      <div
        aria-live="polite"
        className={cn(
          "pointer-events-none fixed bottom-10 left-1/2 z-[95] w-max max-w-[min(1000px,88vw)] -translate-x-1/2 rounded-sedan border-2 border-fg-inverse bg-surface-inverse px-6 py-3.5 text-center font-mono text-[clamp(16px,1.5vw,24px)] leading-snug text-fg-inverse shadow-[6px_6px_0_var(--cta)] transition-opacity duration-300",
          caption ? "opacity-100" : "opacity-0"
        )}
      >
        {caption?.text}
        {caption?.tag && (
          <span className="ml-3 inline-block rounded-sedan-sm bg-warning px-2 py-0.5 align-middle text-[0.6em] uppercase tracking-[0.05em] text-surface-inverse">
            {caption.tag}
          </span>
        )}
      </div>

      {/* Chapter card */}
      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-[98] flex flex-col justify-center bg-surface-inverse px-[6vw] text-fg-inverse transition-opacity duration-300",
          card ? "opacity-100" : "opacity-0"
        )}
      >
        {card && (
          <>
            <p className="font-mono text-[clamp(14px,1.2vw,20px)] uppercase tracking-[0.08em] text-cta">
              {card.kicker}
            </p>
            <h2
              className="mt-4 text-[clamp(44px,6.5vw,112px)] font-bold leading-[0.95] tracking-[-0.02em]"
              // Titles carry an explicit <br> where the line should break.
              dangerouslySetInnerHTML={{ __html: card.title }}
            />
          </>
        )}
      </div>

      {/* End card */}
      {phase === "end" && end && (
        <div className="fixed inset-0 z-[99] flex flex-col justify-center bg-surface-inverse px-[6vw] text-fg-inverse">
          <p className="font-mono text-[clamp(14px,1.2vw,20px)] uppercase tracking-[0.08em] text-fg-inverse-muted">
            {end.kicker}
          </p>
          <h2
            className="mt-4 text-[clamp(44px,6.5vw,112px)] font-bold leading-[0.95] tracking-[-0.02em]"
            dangerouslySetInnerHTML={{ __html: end.title }}
          />
          <div className="mt-[1.2em] flex items-center gap-4 border-t-2 border-border-inverse pt-[0.8em] font-mono text-[clamp(16px,1.4vw,24px)]">
            <AgentalMark className="h-7 w-auto text-cta" />
            {HOST}
          </div>
          {end.note && (
            <p className="mt-4 font-mono text-[12px] uppercase tracking-[0.06em] text-fg-inverse-muted">
              {end.note}
            </p>
          )}
        </div>
      )}
    </>
  );
}
