import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const UI = join(process.cwd(), "src/components/ui");
const files = readdirSync(UI).filter((f) => f.endsWith(".tsx"));
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/**
 * shadcn/ui components arrive from a CLI that once rewrote `@/lib/utils` to a
 * stray npm package named "cn" and pulled in next-themes. These checks keep
 * the kit on our own helpers and our own theme switch.
 */
describe("shadcn/ui kit stays on Agental's own helpers and theme", () => {
  it.each(files)("%s imports cn from @/lib/utils, never a package", (f) => {
    const src = readFileSync(join(UI, f), "utf8");
    expect(src).not.toMatch(/from ["'](cn|next-themes)["']/);
  });

  it("maps shadcn's color names onto the Agental roles", () => {
    for (const name of ["background", "foreground", "primary", "popover", "muted-foreground", "destructive", "input"]) {
      expect(css).toMatch(new RegExp(`--color-${name}: var\\(--`));
    }
  });

  it("treats dark: as the Casting theme, never the visitor's OS setting", () => {
    expect(css).toContain('@custom-variant dark (&:where([data-portal="casting"], [data-portal="casting"] *));');
  });

  it("turns shadcn motion off for visitors who ask for less motion", () => {
    const reduce = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduce).toMatch(/\.animate-in,\s*\.animate-out/);
  });
});
