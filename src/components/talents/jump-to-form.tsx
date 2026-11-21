"use client";

import { Button } from "@/components/ui/button";

/**
 * "Request my site": scrolls to the request form and moves focus to its
 * heading, so keyboard and screen-reader users land where they meant to go.
 * A plain anchor underneath, so it still works before JavaScript loads.
 */
export function JumpToForm({ target, label }: { target: string; label: string }) {
  return (
    <Button asChild size="lg">
      <a
        href={`#${target}`}
        onClick={(e) => {
          const el = document.getElementById(target);
          if (!el) return;
          e.preventDefault();
          el.scrollIntoView({ block: "start" });
          el.focus({ preventScroll: true });
          history.replaceState(null, "", `#${target}`);
        }}
      >
        {label}
      </a>
    </Button>
  );
}
