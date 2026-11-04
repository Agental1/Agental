/**
 * Translation guard. Two checks, one exit code.
 *
 *   bun run i18n:check              both checks
 *   bun run i18n:check --parity     key parity only
 *   bun run i18n:check --leaks      source-literal scan only
 *
 * Parity is the hard signal: English is the reference locale, and any key it has
 * that another locale lacks is a message a visitor will not see translated.
 *
 * The literal scan is deliberately a WARNING, never a failure. A word list
 * cannot tell a French sentence from a proper noun or a loanword ("casting",
 * "self-tape"), so making it blocking would train people to work around it. It
 * points at files; a human decides.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const MESSAGES = join(ROOT, "messages");
const REFERENCE = "en";

type Json = { [k: string]: Json | string | string[] };

/** Every leaf path in a message tree, e.g. "nav.how" or "pricing.plans.0". */
function leafPaths(node: Json | string | string[], prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  if (Array.isArray(node))
    return node.flatMap((v, i) => leafPaths(v, `${prefix}.${i}`));
  return Object.entries(node).flatMap(([k, v]) =>
    leafPaths(v, prefix ? `${prefix}.${k}` : k)
  );
}

async function readNamespace(locale: string, ns: string): Promise<Json | null> {
  try {
    return JSON.parse(await readFile(join(MESSAGES, locale, ns), "utf8"));
  } catch {
    return null;
  }
}

async function checkParity(): Promise<number> {
  const locales = (await readdir(MESSAGES, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const namespaces = (await readdir(join(MESSAGES, REFERENCE))).filter((f) =>
    f.endsWith(".json")
  );

  let failures = 0;
  for (const ns of namespaces) {
    const reference = await readNamespace(REFERENCE, ns);
    if (!reference) {
      console.error(`✗ reference locale is missing ${REFERENCE}/${ns}`);
      failures++;
      continue;
    }
    const expected = new Set(leafPaths(reference));

    for (const locale of locales) {
      if (locale === REFERENCE) continue;
      const actual = await readNamespace(locale, ns);
      if (!actual) {
        console.error(
          `✗ ${locale}/${ns} does not exist — /${locale} will fail to render`
        );
        failures++;
        continue;
      }
      const have = new Set(leafPaths(actual));
      const missing = [...expected].filter((k) => !have.has(k));
      const extra = [...have].filter((k) => !expected.has(k));

      if (missing.length) {
        failures++;
        console.error(`✗ ${locale}/${ns}: ${missing.length} key(s) missing`);
        for (const k of missing.slice(0, 10)) console.error(`    ${k}`);
        if (missing.length > 10)
          console.error(`    … and ${missing.length - 10} more`);
      }
      if (extra.length) {
        console.warn(
          `! ${locale}/${ns}: ${extra.length} key(s) absent from ${REFERENCE} (dead or renamed)`
        );
      }
    }
  }
  console.log(
    failures === 0
      ? `✓ key parity: ${namespaces.length} namespace(s) × ${locales.length} locale(s)`
      : `✗ key parity: ${failures} problem(s)`
  );
  return failures;
}

/**
 * Source scan for French left in the code rather than in a message file.
 *
 * Covers attributes as well as visible text: a hardcoded aria-label is worse
 * than hardcoded body copy, because a screen reader announces French phonemes
 * with an English voice. That class of bug is invisible to any check that only
 * looks at what is rendered on screen.
 */
const FRENCH_MARKERS =
  /\b(le|la|les|une?|des?|du|et|pour|avec|vous|votre|vos|tu|ton|ta|tes|est|sont|être|avoir|dans|sur|par|plus|tout|cette|ce|qui|que|pas|ne|au|aux|déjà|ainsi|selon|chez|sans)\b/i;
const ATTRS = /(?:aria-label|alt|title|placeholder)=["']([^"']{4,})["']/g;
const JSX_TEXT = />\s*([^<>{}\n][^<>{}]{4,})\s*</g;
const SR_ONLY = /className="sr-only">([^<]{3,})</g;

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "generated" || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(entry.name)) yield full;
  }
}

/**
 * Comments are not user-facing, and they produce false positives: the JSX text
 * pattern spans newlines, so a multi-line block comment sitting between a `>`
 * and a `<` reads as rendered text.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

async function checkLeaks(): Promise<void> {
  const hits = new Map<string, string[]>();
  for await (const file of walk(join(ROOT, "src"))) {
    // Every file gets the same scan, translated or not. The previous version
    // skipped JSX text in any file calling useTranslations, on the assumption
    // that such a file was done. Partial translation is the common case, not
    // the exception: profile-editor.tsx called useTranslations for some strings
    // while five tab labels and eleven field labels stayed hardcoded French,
    // and this guard reported the file clean for months.
    const source = stripComments(await readFile(file, "utf8"));
    const found = [
      ...source.matchAll(ATTRS),
      ...source.matchAll(SR_ONLY),
      ...source.matchAll(JSX_TEXT),
    ]
      .map((m) => m[1].trim())
      .filter((v) => FRENCH_MARKERS.test(v));
    if (found.length) hits.set(relative(ROOT, file), found);
  }

  if (hits.size === 0) {
    console.log("✓ no French literals found in src/");
    return;
  }
  console.warn(`! ${hits.size} file(s) hold French literals (advisory):`);
  for (const [file, found] of [...hits].sort((a, b) => b[1].length - a[1].length)) {
    console.warn(`    ${found.length.toString().padStart(4)}  ${file}`);
  }
  console.warn("  Advisory only — a word list cannot judge proper nouns.");
}

const args = process.argv.slice(2);
const runParity = args.length === 0 || args.includes("--parity");
const runLeaks = args.length === 0 || args.includes("--leaks");

let failures = 0;
if (runParity) failures += await checkParity();
if (runLeaks) await checkLeaks();
process.exit(failures === 0 ? 0 : 1);
