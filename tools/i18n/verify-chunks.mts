/**
 * Round 11, group 4: check translation chunks before building.
 *   tsx tools/i18n/verify-chunks.mts <locale> [ns]
 * For each chunk: its length, the English and translated strings at both ends
 * (a shifted chunk shows at once), and every string whose ICU arguments or
 * rich tags differ from English.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
type Json = string | Json[] | { [k: string]: Json };
function leaves(n: Json, p = "", o: [string, string][] = []): [string, string][] {
  if (typeof n === "string") o.push([p, n]);
  else if (Array.isArray(n)) n.forEach((v, i) => leaves(v, `${p}.${i}`, o));
  else for (const [k, v] of Object.entries(n)) leaves(v, p ? `${p}.${k}` : k, o);
  return o;
}
function args(s: string): string[] {
  const out = new Set<string>();
  let i = 0;
  const text = () => {
    while (i < s.length && s[i] !== "}") {
      if (s[i] === "{") {
        i++;
        arg();
      } else i++;
    }
  };
  const arg = () => {
    const m = /^\s*([^,}\s]+)\s*/.exec(s.slice(i));
    if (!m) return;
    out.add(m[1]);
    i += m[0].length;
    if (s[i] === "}") return void i++;
    i++;
    const t = /^\s*(\w+)\s*/.exec(s.slice(i));
    if (!t) return;
    i += t[0].length;
    if (["plural", "select", "selectordinal"].includes(t[1])) {
      i++;
      while (i < s.length && s[i] !== "}") {
        const open = s.indexOf("{", i);
        if (open < 0) return;
        i = open + 1;
        text();
        i++;
        while (i < s.length && /\s/.test(s[i])) i++;
      }
      i++;
      return;
    }
    let d = 1;
    while (i < s.length && d > 0) {
      if (s[i] === "{") d++;
      if (s[i] === "}") d--;
      i++;
    }
  };
  while (i < s.length) {
    text();
    i++;
  }
  const tags = [...s.matchAll(/<\/?([A-Za-z][\w-]*)>/g)].map((m) => m[1]);
  return [...[...out].sort(), "|", ...[...new Set(tags)].sort()];
}

const [locale, only] = process.argv.slice(2);
const dir = join(ROOT, "tools/i18n/work", locale);
let problems = 0;
for (const ns of only ? [only] : ["common", "talents", "casting", "app"]) {
  const en = leaves(JSON.parse(await readFile(join(ROOT, "messages/en", `${ns}.json`), "utf8")));
  const files = (await readdir(dir)).filter((f) => f.startsWith(`${ns}.`)).sort((a, b) => Number(a.split(".")[1]) - Number(b.split(".")[1]));
  let covered = 0;
  for (const f of files) {
    const start = Number(f.split(".")[1]);
    if (start !== covered) {
      console.log(`✗ ${f}: starts at ${start}, expected ${covered}`);
      problems++;
    }
    const chunk = JSON.parse(await readFile(join(dir, f), "utf8")) as string[];
    covered = start + chunk.length;
    const last = start + chunk.length - 1;
    console.log(`${f}: ${chunk.length} [${start}..${last}]  first ${en[start]?.[0]} | last ${en[last]?.[0]} = ${JSON.stringify(chunk.at(-1)).slice(0, 50)} / EN ${JSON.stringify(en[last]?.[1]).slice(0, 50)}`);
    chunk.forEach((v, i) => {
      const e = en[start + i];
      if (!e) {
        console.log(`  ✗ extra string at ${start + i}`);
        problems++;
        return;
      }
      if (args(e[1]).join(",") !== args(v).join(",")) {
        console.log(`  ✗ ${start + i} ${e[0]}: ${JSON.stringify(e[1])} -> ${JSON.stringify(v)}`);
        problems++;
      }
      if (v.includes("—")) {
        console.log(`  ✗ em dash at ${start + i}`);
        problems++;
      }
    });
  }
  console.log(`${ns}: ${covered}/${en.length} covered`);
}
console.log(problems ? `✗ ${problems} problem(s)` : "✓ no problem");
