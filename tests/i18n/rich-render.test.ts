import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IntlMessageFormat } from "intl-messageformat";
import { routing } from "@/i18n/routing";

/**
 * Round 11 review: a straight apostrophe before a tag ("l'<privacy>") makes ICU
 * print the tag as text, so the Privacy Policy link vanished in Italian while
 * the parity test passed. Every string with a rich tag is rendered in every
 * locale; no "<" may reach the reader.
 */
const NAMESPACES = ["common", "talents", "casting", "app"];
type Node = string | Node[] | { [k: string]: Node };

function leaves(node: Node, prefix = "", out = new Map<string, string>()): Map<string, string> {
  if (typeof node === "string") out.set(prefix, node);
  else if (Array.isArray(node)) node.forEach((v, i) => leaves(v, `${prefix}.${i}`, out));
  else for (const [k, v] of Object.entries(node)) leaves(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

const TAG = /<([a-zA-Z0-9]+)>/g;

describe("rich strings render their tags in every locale", () => {
  for (const locale of routing.locales) {
    it(locale, () => {
      const bad: string[] = [];
      for (const ns of NAMESPACES) {
        const strings = leaves(JSON.parse(readFileSync(join(process.cwd(), "messages", locale, `${ns}.json`), "utf8")));
        for (const [key, msg] of strings) {
          const tags = [...msg.matchAll(TAG)].map((m) => m[1]);
          if (tags.length === 0) continue;
          const values: Record<string, unknown> = {};
          for (const t of tags) values[t] = (chunks: unknown[]) => `[${chunks.join("")}]`;
          let out: unknown;
          try {
            out = new IntlMessageFormat(msg, locale).format(new Proxy(values, { get: (o, k) => (k in o ? o[k as string] : "x") }));
          } catch {
            continue; // Parse errors are the parity test's job.
          }
          const text = Array.isArray(out) ? out.join("") : String(out);
          if (/<\/?[a-zA-Z0-9]+>/.test(text)) bad.push(`${ns}.${key}`);
        }
      }
      expect(bad).toEqual([]);
    });
  }
});
