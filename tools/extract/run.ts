/**
 * Extraction pipeline entrypoint.
 *   bun tools/extract/run.ts "../Some Bundled Page.html" [moreFiles...]
 *   bun tools/extract/run.ts --all      # process the 4 known mockups
 *
 * For each input: unpack → write fonts → split by data-screen-label →
 * de-DSL notes → re-tokenize inline colors → write fragments + coverage report.
 * Output lands in tools/extract/out/<slug>/ ; fonts in public/fonts/<slug>/.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { unpack } from "./unpack";
import { tokenize } from "./tokenize";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(HERE, "..", ".."); // app/
const PARENT = join(APP_ROOT, ".."); // _Agental/

const KNOWN = [
  "Agental Talents (hors-ligne) (validé).html",
  "Agental Casting (hors-ligne) (validé).html",
  "Agental - Landings casting (hors-ligne validé).html",
  "Agental - Contenu & Images (hors-ligne).html",
];

// Editorial/asset reference sheet — not a product portal; uses off-palette
// tints on purpose, so it is processed & reported but does NOT gate the run.
const REFERENCE_SLUGS = new Set(["agental-contenu-images-hors-ligne"]);

function slugify(name: string): string {
  return basename(name, ".html")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Balance a container tag opened at `openStart`, returning the end index. */
function balanceTag(html: string, tag: string, openStart: number): number {
  const openRe = new RegExp(`<${tag}\\b`, "g");
  const closeRe = new RegExp(`</${tag}>`, "g");
  // Skip to end of the opening tag.
  const afterOpen = html.indexOf(">", openStart) + 1;
  let depth = 1;
  let i = afterOpen;
  while (depth > 0 && i < html.length) {
    openRe.lastIndex = i;
    closeRe.lastIndex = i;
    const o = openRe.exec(html);
    const c = closeRe.exec(html);
    if (!c) return html.length;
    if (o && o.index < c.index) {
      depth++;
      i = o.index + 1;
    } else {
      depth--;
      i = c.index + `</${tag}>`.length;
    }
  }
  return i;
}

function extractScreens(html: string): { label: string; html: string }[] {
  const re = /<([a-zA-Z][\w-]*)\b[^>]*\bdata-screen-label="([^"]+)"[^>]*>/g;
  const screens: { label: string; html: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [, tag, label] = m;
    const end = balanceTag(html, tag, m.index);
    screens.push({ label, html: html.slice(m.index, end) });
    re.lastIndex = end; // don't re-enter nested labels of this screen
  }
  return screens;
}

function dslNotes(html: string) {
  const count = (re: RegExp) => (html.match(re) ?? []).length;
  const conds = [
    ...new Set(
      [...html.matchAll(/<sc-if[^>]*\bvalue="\{\{([^}]+)\}\}"/g)].map((m) =>
        m[1].trim()
      )
    ),
  ];
  const loops = [
    ...new Set(
      [...html.matchAll(/<sc-for[^>]*\b(?:each|items)="\{\{([^}]+)\}\}"/g)].map(
        (m) => m[1].trim()
      )
    ),
  ];
  const icons = [
    ...new Set([...html.matchAll(/data-lucide="([^"]+)"/g)].map((m) => m[1])),
  ].sort();
  return {
    scIf: count(/<sc-if\b/g),
    scFor: count(/<sc-for\b/g),
    conditions: conds,
    loops,
    icons,
  };
}

function processFile(srcPath: string) {
  const slug = slugify(srcPath);
  const outDir = join(HERE, "out", slug);
  const fontsDir = join(APP_ROOT, "public", "fonts", slug);
  mkdirSync(join(outDir, "screens"), { recursive: true });

  const src = readFileSync(srcPath, "utf8");
  const { html, fonts, assetCount } = unpack(src, {
    fontsDir,
    publicPrefix: `/fonts/${slug}`,
  });

  const { html: tokenizedFull, report: fullReport } = tokenize(html);
  writeFileSync(join(outDir, "rendered.html"), html);
  writeFileSync(join(outDir, "tokenized.html"), tokenizedFull);

  const screens = extractScreens(html);
  const screenReports: {
    label: string;
    coverage: number;
    dsl: ReturnType<typeof dslNotes>;
  }[] = [];
  for (const s of screens) {
    const { html: tok, report } = tokenize(s.html);
    const safe = s.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    writeFileSync(join(outDir, "screens", `${safe}.html`), tok);
    screenReports.push({
      label: s.label,
      coverage: report.coverage,
      dsl: dslNotes(s.html),
    });
  }

  const report = {
    source: basename(srcPath),
    slug,
    assetCount,
    fonts: fonts.length,
    screens: screens.map((s) => s.label),
    coverage: {
      total: fullReport.total,
      mapped: fullReport.mapped,
      pct: +(fullReport.coverage * 100).toFixed(1),
    },
    topMisses: fullReport.misses.slice(0, 15),
    dsl: dslNotes(html),
    perScreen: screenReports,
  };
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  return report;
}

function resolveInput(arg: string): string {
  if (existsSync(arg)) return arg;
  const inParent = join(PARENT, arg);
  if (existsSync(inParent)) return inParent;
  throw new Error(`Input not found: ${arg}`);
}

function main() {
  const args = process.argv.slice(2);
  const files =
    args.length === 0 || args[0] === "--all"
      ? KNOWN.map((f) => join(PARENT, f))
      : args.map(resolveInput);

  const summaries: { pct: number; gated: boolean }[] = [];
  for (const f of files) {
    if (!existsSync(f)) {
      console.warn(`⚠︎  skip (missing): ${f}`);
      continue;
    }
    const r = processFile(f);
    const gated = !REFERENCE_SLUGS.has(r.slug);
    summaries.push({ pct: r.coverage.pct, gated });
    const flag = !gated ? "○" : r.coverage.pct >= 90 ? "✓" : "✗";
    const tag = gated ? "" : "  (reference, non-gating)";
    console.log(
      `${flag} ${r.source}${tag}\n    coverage ${r.coverage.pct}% (${r.coverage.mapped}/${r.coverage.total})  ·  ${r.screens.length} screens  ·  ${r.fonts} fonts`
    );
    if (r.topMisses.length && r.coverage.pct < 99) {
      console.log(
        `    top misses: ${r.topMisses
          .slice(0, 6)
          .map((m) => `${m.color}×${m.count}`)
          .join("  ")}`
      );
    }
  }

  const gatedPcts = summaries.filter((s) => s.gated).map((s) => s.pct);
  const min = gatedPcts.length ? Math.min(...gatedPcts) : 100;
  console.log(
    `\nDone. ${summaries.length} file(s). Min coverage (gated) ${min.toFixed(1)}%. ` +
      `Reports in tools/extract/out/<slug>/report.json`
  );
  if (min < 90) process.exitCode = 1;
}

main();
