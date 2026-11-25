import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { routing } from "@/i18n/routing";

/**
 * Round 11: every locale has every English key, and each string keeps the same
 * placeholders ({email}, {count}...) and rich tags (<privacy>...</privacy>),
 * so a translation can never drop a value or a link.
 */
const NAMESPACES = ["common", "talents", "casting", "app"];
type Node = string | Node[] | { [k: string]: Node };

function leaves(node: Node, prefix = "", out = new Map<string, string>()): Map<string, string> {
  if (typeof node === "string") out.set(prefix, node);
  else if (Array.isArray(node)) node.forEach((v, i) => leaves(v, `${prefix}.${i}`, out));
  else for (const [k, v] of Object.entries(node)) leaves(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

const read = (l: string, ns: string) =>
  leaves(JSON.parse(readFileSync(join(process.cwd(), "messages", l, `${ns}.json`), "utf8")));

/** ICU argument names in a message: {name}, {count, plural, one {...} other {...}}, nested too. */
function icuArgs(s: string): Set<string> {
  const args = new Set<string>();
  let i = 0;
  // Text until the closing "}" of a branch (or the end).
  function text(): void {
    while (i < s.length && s[i] !== "}") {
      if (s[i] === "{") {
        i++;
        arg();
      } else i++;
    }
  }
  function arg(): void {
    const name = /^\s*([^,}\s]+)\s*/.exec(s.slice(i))!;
    args.add(name[1]);
    i += name[0].length;
    if (s[i] === "}") {
      i++;
      return;
    }
    i++; // ","
    const type = /^\s*(\w+)\s*/.exec(s.slice(i))!;
    i += type[0].length;
    if (["plural", "select", "selectordinal"].includes(type[1])) {
      i++; // ","
      while (i < s.length && s[i] !== "}") {
        const open = s.indexOf("{", i);
        if (open < 0) return;
        i = open + 1;
        text();
        i++; // the branch's "}"
        while (i < s.length && /\s/.test(s[i])) i++;
      }
      i++;
      return;
    }
    // {n, number, ...}: skip to the matching "}".
    let depth = 1;
    while (i < s.length && depth > 0) {
      if (s[i] === "{") depth++;
      if (s[i] === "}") depth--;
      i++;
    }
  }
  while (i < s.length) {
    text();
    i++;
  }
  return args;
}

/** Argument names ({name}, {count, plural, ...}) and tag names, sorted, deduplicated. */
export function signature(s: string): string {
  const args = icuArgs(s);
  const tags = new Set<string>();
  for (const m of s.matchAll(/<\/?([A-Za-z][\w-]*)>/g)) tags.add(m[1]);
  return [[...args].sort().join(","), [...tags].sort().join(",")].join("|");
}

describe("every locale matches English (round 11)", () => {
  for (const ns of NAMESPACES) {
    const en = read("en", ns);
    for (const l of routing.locales.filter((x) => x !== "en")) {
      it(`${l}/${ns}: same keys and placeholders`, () => {
        const other = read(l, ns);
        const missing = [...en.keys()].filter((k) => !other.has(k));
        expect(missing).toEqual([]);
        const wrong = [...en.entries()]
          .filter(([k, v]) => signature(v) !== signature(other.get(k) ?? ""))
          .map(([k]) => k);
        expect(wrong).toEqual([]);
      });
    }
  }

  it("no em dash in any message", () => {
    for (const l of routing.locales)
      for (const ns of NAMESPACES)
        for (const [k, v] of read(l, ns)) if (v.includes("—")) throw new Error(`${l}/${ns} ${k}`);
  });
});
