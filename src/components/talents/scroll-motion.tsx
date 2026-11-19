"use client";

import { useEffect } from "react";

/**
 * Fallback for browsers without scroll-driven animations (Firefox today).
 *
 * Where `animation-timeline: view()` is supported, globals.css does all the
 * work and this component does nothing. Elsewhere it watches the motion
 * targets and flips `data-motion` from "pending" to "in" as each enters the
 * viewport, so the same end states arrive by transition. It runs after
 * hydration, so it never fights React over server-rendered attributes, and a
 * MutationObserver picks up targets that arrive with client navigation.
 */
export const MOTION_SELECTOR = ".hit-mark, .darkroom, [data-assemble]";

export function ScrollMotion() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (CSS.supports?.("animation-timeline: view()")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.motion = "in";
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px" }
    );

    const scan = () => {
      document.querySelectorAll<HTMLElement>(MOTION_SELECTOR).forEach((el) => {
        if (el.dataset.motion) return;
        el.dataset.motion = "pending";
        io.observe(el);
      });
    };
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  return null;
}
