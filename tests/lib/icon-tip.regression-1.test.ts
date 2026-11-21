// Regression: IconTip crashed every media card ("Tooltip must be used within TooltipProvider")
// Found by /review on 2026-11-20 (round 6 Part 2)
import { describe, expect, it } from "vitest";
import { createElement, type FC, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { IconTip } from "@/components/ui/tooltip";

describe("IconTip", () => {
  it("renders on its own, with no provider mounted above it", () => {
    const html = renderToString(createElement(IconTip as unknown as FC<{ label: string; children?: ReactNode }>, { label: "Delete" }, createElement("button", null, "x")));
    expect(html).toContain("<button");
  });
});
