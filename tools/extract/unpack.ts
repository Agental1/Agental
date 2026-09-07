/**
 * Unpack a "Bundled Page" export.
 *
 * Each export embeds three script blocks:
 *   <script type="__bundler/manifest">   → { uuid: {mime, compressed, data(base64)} }
 *   <script type="__bundler/ext_resources"> → [] (usually empty)
 *   <script type="__bundler/template">    → JSON-encoded string of the full rendered HTML
 *
 * Assets are base64, gzip-compressed when `compressed: true`. Fonts (woff2) are
 * written to disk; UUID references in the template are rewritten to local paths.
 */
import { gunzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface ManifestEntry {
  mime: string;
  compressed?: boolean;
  data: string;
}
export type Manifest = Record<string, ManifestEntry>;

const MIME_EXT: Record<string, string> = {
  "font/woff2": "woff2",
  "font/woff": "woff",
  "text/javascript": "js",
  "application/javascript": "js",
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "text/css": "css",
};

function scriptBlock(html: string, type: string): string | null {
  const re = new RegExp(
    `<script type="__bundler/${type}">([\\s\\S]*?)</script>`,
    "i"
  );
  const m = re.exec(html);
  return m ? m[1].trim() : null;
}

/**
 * Largest asset we will materialise. The real ones are woff2 subsets measured in
 * tens of KB; this only exists so a crafted export cannot expand a few KB of
 * base64 into whatever it likes and take the process out before the write.
 */
const MAX_ASSET_BYTES = 8 * 1024 * 1024;

export function decodeEntry(entry: ManifestEntry): Buffer {
  const raw = Buffer.from(entry.data, "base64");
  return entry.compressed
    ? gunzipSync(raw, { maxOutputLength: MAX_ASSET_BYTES })
    : raw;
}

export interface UnpackResult {
  html: string; // rendered template with local asset paths
  fonts: { uuid: string; file: string; bytes: number }[];
  assetCount: number;
}

/**
 * Unpack `srcHtml`, writing font assets under `fontsDir` (public path
 * `publicPrefix`, e.g. "/fonts/talents"). Returns the rewritten HTML template.
 */
export function unpack(
  srcHtml: string,
  opts: { fontsDir: string; publicPrefix: string }
): UnpackResult {
  const manifestRaw = scriptBlock(srcHtml, "manifest");
  const templateRaw = scriptBlock(srcHtml, "template");
  if (!manifestRaw || !templateRaw) {
    throw new Error("Missing __bundler/manifest or __bundler/template block");
  }
  const manifest = JSON.parse(manifestRaw) as Manifest;
  let template = JSON.parse(templateRaw) as string;

  mkdirSync(opts.fontsDir, { recursive: true });

  const fonts: UnpackResult["fonts"] = [];
  for (const [uuid, entry] of Object.entries(manifest)) {
    // The key comes straight out of the designer's file and is used as a
    // filename. `join()` normalises "..", it does not confine — a key of
    // "../../../x" would write outside fontsDir. The extension is force-appended
    // below, so the worst case is a stray .woff2 somewhere, but "somewhere" is
    // the part worth closing.
    if (!/^[A-Za-z0-9_-]+$/.test(uuid)) {
      throw new Error(
        `Refusing manifest key ${JSON.stringify(uuid.slice(0, 40))}: ` +
          `asset ids must match /^[A-Za-z0-9_-]+$/`
      );
    }
    const ext = MIME_EXT[entry.mime] ?? "bin";
    if (ext === "woff2" || ext === "woff") {
      const bytes = decodeEntry(entry);
      const file = `${uuid}.${ext}`;
      writeFileSync(join(opts.fontsDir, file), bytes);
      const publicPath = `${opts.publicPrefix}/${file}`;
      // Rewrite every occurrence of the bare UUID to the local font path.
      template = template.split(uuid).join(publicPath);
      fonts.push({ uuid, file, bytes: bytes.length });
    } else {
      // JS runtime / other assets: strip references (we rebuild in React).
      // Drop <script src="uuid"></script> tags entirely.
      // Safe to interpolate: the key was validated against
      // /^[A-Za-z0-9_-]+$/ above, so it carries no regex metacharacter. Kept as
      // a pattern rather than a literal split because attribute order in the
      // export is not guaranteed, and [^>]* handles that where an exact string
      // would silently leave the tag behind.
      template = template
        .split(new RegExp(`<script[^>]*src="${uuid}"[^>]*>\\s*</script>`, "g"))
        .join("");
    }
  }

  return { html: template, fonts, assetCount: Object.keys(manifest).length };
}
