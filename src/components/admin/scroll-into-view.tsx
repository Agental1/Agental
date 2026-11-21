"use client";

import { useEffect } from "react";

/** Scrolls the element with this id into view once, on mount. Renders nothing. */
export function ScrollIntoView({ targetId }: { targetId: string }) {
  useEffect(() => {
    document.getElementById(targetId)?.scrollIntoView({ block: "center" });
  }, [targetId]);
  return null;
}
