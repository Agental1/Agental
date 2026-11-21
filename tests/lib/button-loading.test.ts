import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";

type Props = { onClick: (e: { preventDefault: () => void }) => void; "aria-busy"?: boolean; "aria-disabled"?: boolean; disabled?: boolean };

/**
 * Value: protects=a loading button blocks repeat clicks and keeps focus (aria-disabled, not disabled);
 * fails_when=the loading guard is removed or swapped for disabled; why_new=no test covered Button;
 * seam=none; no_claim=real DOM focus behavior (no DOM renderer in this repo's Vitest)
 */
describe("Button loading", () => {
  it("blocks the click and marks itself busy, without disabling", () => {
    const onClick = vi.fn();
    const el = Button({ loading: true, onClick, children: "Save" }) as ReactElement<Props>;
    const e = { preventDefault: vi.fn() };
    el.props.onClick(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    expect(el.props["aria-busy"]).toBe(true);
    expect(el.props["aria-disabled"]).toBe(true);
    expect(el.props.disabled).toBeUndefined();
  });

  it("passes the click through when not loading", () => {
    const onClick = vi.fn();
    const el = Button({ onClick, children: "Save" }) as ReactElement<Props>;
    el.props.onClick({ preventDefault: vi.fn() });
    expect(onClick).toHaveBeenCalledOnce();
    expect(el.props["aria-busy"]).toBeUndefined();
  });
});
