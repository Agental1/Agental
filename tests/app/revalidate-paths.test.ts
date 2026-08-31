import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every revalidatePath argument must name a route that exists on disk.
 *
 * The ESLint rule next to this checks the *shape* of the string — that it
 * starts with /[locale]/ and carries a type. It cannot check that the route is
 * real. Renaming or moving a route silently turns these calls back into no-ops,
 * which is exactly how the previous 18 came to match nothing: the paths were
 * written as URLs and nobody noticed, because a miss produces no warning, no
 * error, and no log line — only stale data.
 */

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const ACTIONS = join(ROOT, "src/app/actions");
const APP = join(ROOT, "src/app");

const CALL = /revalidatePath\(\s*"([^"]+)"\s*(?:,\s*"(page|layout)"\s*)?\)/g;

async function collect(): Promise<
  Array<{ file: string; path: string; type?: string }>
> {
  const out: Array<{ file: string; path: string; type?: string }> = [];
  for (const name of await readdir(ACTIONS)) {
    if (!name.endsWith(".ts")) continue;
    const source = await readFile(join(ACTIONS, name), "utf8");
    for (const m of source.matchAll(CALL)) {
      out.push({ file: name, path: m[1], type: m[2] });
    }
  }
  return out;
}

async function exists(p: string): Promise<boolean> {
  try {
    await readdir(p);
    return true;
  } catch {
    return false;
  }
}

const calls = await collect();

describe("revalidatePath targets", () => {
  it("finds the calls at all, so a green run means something", () => {
    // Guards the guard: if the regex stops matching, every assertion below
    // passes vacuously.
    expect(calls.length).toBeGreaterThan(10);
  });

  it.each(calls)("$file: $path resolves to a real route", async ({ path }) => {
    expect(await exists(join(APP, path))).toBe(true);
  });

  it.each(calls)("$file: $path carries a type", ({ type }) => {
    // Required whenever the path holds a dynamic segment, and every route here
    // sits under [locale].
    expect(type).toBeDefined();
  });

  it.each(calls)("$file: $path names the file it claims", async ({ path, type }) => {
    const entries = await readdir(join(APP, path));
    expect(entries).toContain(type === "layout" ? "layout.tsx" : "page.tsx");
  });
});
