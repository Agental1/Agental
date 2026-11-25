/**
 * Round 11, group 4: translation helper.
 *
 *   tsx tools/i18n/flatten.mts dump <ns> [start] [count]   prints "index<TAB>path<TAB>value" lines of messages/en/<ns>.json
 *   tsx tools/i18n/flatten.mts build <locale>              rebuilds messages/<locale>/*.json from
 *                                                          tools/i18n/work/<locale>/<ns>.*.json chunk files
 *
 * A chunk file <ns>.<start>.json is a JSON array of translated strings, in the
 * order of the dump, starting at index <start>. The build
 * keeps the English tree's shape (objects and arrays), and fails on a missing
 * path, so every key exists in the new locale.
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const MESSAGES = join(ROOT, "messages");
const WORK = join(ROOT, "tools/i18n/work");

type Json = { [k: string]: Json | string | Json[] | string[] } | string | Json[];

function leaves(node: Json, prefix = "", out: [string, string][] = []): [string, string][] {
  if (typeof node === "string") out.push([prefix, node]);
  else if (Array.isArray(node)) node.forEach((v, i) => leaves(v as Json, `${prefix}.${i}`, out));
  else for (const [k, v] of Object.entries(node)) leaves(v as Json, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

function rebuild(node: Json, prefix: string, tr: Map<string, string>, missing: string[]): Json {
  if (typeof node === "string") {
    const v = tr.get(prefix);
    if (v === undefined) {
      missing.push(prefix);
      return node;
    }
    return v;
  }
  if (Array.isArray(node)) return node.map((v, i) => rebuild(v as Json, `${prefix}.${i}`, tr, missing)) as Json;
  const o: Record<string, Json> = {};
  for (const [k, v] of Object.entries(node)) o[k] = rebuild(v as Json, prefix ? `${prefix}.${k}` : k, tr, missing);
  return o as Json;
}

const [cmd, a, b, c] = process.argv.slice(2);
if (cmd === "dump") {
  const en = JSON.parse(await readFile(join(MESSAGES, "en", `${a}.json`), "utf8"));
  const all = leaves(en);
  const start = Number(b ?? 0);
  const count = Number(c ?? all.length);
  all.slice(start, start + count).forEach(([p, v], i) => console.log(`${start + i} ${p.split(".").slice(-2).join(".")} ${JSON.stringify(v)}`));
  if (!b) console.error(`${all.length} strings`);
} else if (cmd === "build") {
  const locale = a;
  const dir = join(WORK, locale);
  const files = await readdir(dir);
  for (const ns of ["common", "talents", "casting", "app"]) {
    const en = JSON.parse(await readFile(join(MESSAGES, "en", `${ns}.json`), "utf8"));
    const paths = leaves(en).map(([p]) => p);
    const tr = new Map<string, string>();
    for (const f of files.filter((f) => f.startsWith(`${ns}.`) && f.endsWith(".json"))) {
      const start = Number(f.split(".")[1]);
      const chunk = JSON.parse(await readFile(join(dir, f), "utf8")) as string[];
      chunk.forEach((v, i) => {
        if (start + i < paths.length) tr.set(paths[start + i], v);
      });
    }
    const missing: string[] = [];
    const out = rebuild(en, "", tr, missing);
    await mkdir(join(MESSAGES, locale), { recursive: true });
    await writeFile(join(MESSAGES, locale, `${ns}.json`), JSON.stringify(out, null, 2) + "\n");
    console.log(`${locale}/${ns}: ${tr.size} translated, ${missing.length} missing`);
    for (const m of missing.slice(0, 20)) console.log(`  missing ${m}`);
  }
}
