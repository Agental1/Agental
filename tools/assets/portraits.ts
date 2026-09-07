/**
 * Portrait derivative pipeline.
 *   bun run assets:portraits
 *
 * Reads the AI-generated portrait sets out of `.assets/portraits/<locale>/`
 * (gitignored, 57 MB) and writes the ~2 MB of WebP the site actually ships to
 * `src/assets/portraits/<locale>/`, plus a manifest recording each source
 * filename and its sha256.
 *
 * Why a manifest: only the derivatives are committed, so a clean checkout
 * cannot regenerate them. The manifest is what makes that honest instead of
 * hidden — whoever holds the sources can verify a regeneration byte for byte.
 *
 * Populate `.assets/` first (`unzip` is not assumed to exist):
 *   python3 -m zipfile -e "New LP/agentalportraitslanguefranaise.zip"                   .assets/portraits/fr
 *   python3 -m zipfile -e "New LP/agentalportraitslangueanglaiseusa.zip"                .assets/portraits/en
 *   python3 -m zipfile -e "New LP/agentalportraitslangueespagnolemixespagnemexique.zip" .assets/portraits/es
 *
 * Selection is an explicit list, never a glob, and it is keyed to what each
 * image ACTUALLY SHOWS rather than to its filename.
 *
 * That distinction is load-bearing. In the FR and ES sets the character
 * portraits are permuted against their filenames: FR
 * `classe_B_fille_9_ecoliere_blonde.png` is a man of about thirty, and
 * `classe_B_femme_25_femme_voilee.png` is a man of about fifty outdoors. The
 * six people the FR names describe are all present, just shuffled across the
 * six files. ES has the same shuffle. The EN set and every age-band file in
 * all three sets are labelled correctly.
 *
 * So every entry below carries a comment describing the person in the frame,
 * verified by eye on a contact sheet. Captions and alt text are written from
 * those descriptions, never from the filename — a caption that describes
 * someone the image does not show is a lie in the visible text.
 *
 * The FR list is further constrained: only 6 of its 17 character portraits are
 * 1122x1402, the rest are ~270px thumbnails that would ship a soft face in a
 * hero tile.
 *
 * (`zone_EN_adolescent-2png.png` is not a duplicate of `zone_EN_adolescent`
 * despite sharing its dimensions — it is a different teenager with a mangled
 * name. Neither is used here.)
 */
import sharp from "sharp";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC_ROOT = join(APP_ROOT, ".assets", "portraits");
const OUT_ROOT = join(APP_ROOT, "src", "assets", "portraits");

const LOCALES = ["fr", "en", "es"] as const;
type Locale = (typeof LOCALES)[number];

/**
 * The six age bands, ascending. Mirrors `AgeBand` in src/data/portraits.ts,
 * and cannot import it: that module statically imports 30 .webp files, which
 * only the bundler can resolve — a bun script choking on the first import.
 * A seventh band has to be added in BOTH places.
 */
const AGE_BANDS = [
  "enfant",
  "adolescent",
  "jeune-adulte",
  "adulte",
  "senior",
  "senior-plus",
] as const;

/**
 * Hero collage, four slots per locale.
 *
 * Every entry here is 1122x1402. That is not decoration: only 6 of the 17 FR
 * character portraits are full resolution, the other 11 are ~270x305
 * thumbnails. Picking one of those for a hero tile ships a blurry face.
 *
 * Each locale spreads age and social class, because the collage is the visual
 * argument for "chaque profil a une force".
 */
const HERO: Record<Locale, string[]> = {
  // Filenames are shuffled here; the trailing comment is the truth.
  fr: [
    "zone_FR_classe_B_femme_24_serveuse.png", //          blonde girl, about 9
    "zone_FR_classe_B_homme_29_employe_creatif.png", //   woman in a hijab, about 25
    "zone_FR_classe_B_fille_9_ecoliere_blonde.png", //    man, about 30, city street
    "zone_FR_classe_B_femme_25_femme_voilee.png", //      man, about 50, outdoors, rural
  ],
  // The EN names are accurate.
  en: [
    "zone_EN_classe_A_garcon_17_lyceen_afro_american.png", //     Black teenage boy, about 17
    "zone_EN_classe_A_femme_23_etudiante_afro_american.png", //   young mixed-race woman, about 23
    "zone_EN_classe_B_femme_31_designer_ux_asian_american.png", // Asian-American woman, about 35, glasses
    "zone_EN_classe_C_homme_44_consultant_asian_american.png", //  Asian-American man, about 45, suit
  ],
  // Shuffled like FR.
  es: [
    "zone_ESP_classe_B_femme_41_professeure.png", //       teenage boy, about 18, hoodie
    "zone_ESP_classe_C_homme_38_consultant.png", //        young woman, about 28
    "zone_ESP_classe_B_homme_32_employe_bureau.png", //    tattooed man, about 35
    "zone_ESP_classe_B_femme_27_graphiste.png", //         woman, about 40, suit
  ],
};

/** Age bands. Spanish ships the Mexican set; the zip mixes ESP and MX prefixes. */
const AGES: Record<Locale, Record<(typeof AGE_BANDS)[number], string>> = {
  fr: {
    enfant: "zone_FR_enfant.png",
    adolescent: "zone_FR_adolescent.png",
    "jeune-adulte": "zone_FR_jeune_adulte.png",
    adulte: "zone_FR_adulte.png",
    senior: "zone_FR_senior.png",
    "senior-plus": "zone_FR_senior_plus.png",
  },
  en: {
    enfant: "zone_EN_enfant-1.png",
    adolescent: "zone_EN_adolescent.png",
    "jeune-adulte": "zone_EN_jeune_adulte.png",
    adulte: "zone_EN_adulte-1.png",
    senior: "zone_EN_senior.png",
    "senior-plus": "zone_EN_senior_plus.png",
  },
  es: {
    enfant: "zone_MX_enfant.png",
    adolescent: "zone_MX_adolescent.png",
    "jeune-adulte": "zone_MX_jeune_adulte.png",
    adulte: "zone_MX_adulte.png",
    senior: "zone_MX_senior.png",
    "senior-plus": "zone_MX_senior_plus.png",
  },
};

/**
 * 900px covers the largest realistic render: each collage tile is roughly
 * 294 CSS px on a desktop hero, so this leaves 3x DPR headroom and next/image
 * downscales per breakpoint from there.
 */
const HERO_WIDTH = 900;

interface ManifestEntry {
  source: string;
  sha256: string;
  out: string;
  width: number;
  height: number;
  bytes: number;
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function requireSource(locale: Locale, name: string): string {
  const p = join(SRC_ROOT, locale, name);
  if (!existsSync(p)) {
    throw new Error(
      `Missing source: ${p}\n` +
        `Populate .assets/portraits/ first — see the header of this file for the ` +
        `three python3 -m zipfile commands.`
    );
  }
  return p;
}

async function emit(
  srcPath: string,
  outPath: string,
  resizeTo: number | null
): Promise<ManifestEntry> {
  const raw = readFileSync(srcPath);
  let pipeline = sharp(raw);
  // withoutEnlargement matters for the age bands: their sources are ~225px and
  // upscaling them would trade sharpness for file size.
  if (resizeTo) pipeline = pipeline.resize({ width: resizeTo, withoutEnlargement: true });
  const buf = await pipeline
    .webp({ quality: resizeTo ? 78 : 82, effort: 6 })
    .toBuffer();
  const meta = await sharp(buf).metadata();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buf);
  return {
    source: srcPath.slice(APP_ROOT.length + 1),
    sha256: sha256(raw),
    out: outPath.slice(APP_ROOT.length + 1),
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    bytes: buf.length,
  };
}

async function main() {
  if (!existsSync(SRC_ROOT)) {
    console.error(
      `.assets/portraits/ is missing. Populate it first — see the header of ` +
        `tools/assets/portraits.ts for the three python3 -m zipfile commands.`
    );
    process.exit(1);
  }

  const manifest: ManifestEntry[] = [];
  let total = 0;

  for (const locale of LOCALES) {
    for (const [i, name] of HERO[locale].entries()) {
      const entry = await emit(
        requireSource(locale, name),
        join(OUT_ROOT, locale, `hero-${i + 1}.webp`),
        HERO_WIDTH
      );
      manifest.push(entry);
      total += entry.bytes;
    }
    for (const band of AGE_BANDS) {
      const entry = await emit(
        requireSource(locale, AGES[locale][band]),
        join(OUT_ROOT, locale, `age-${band}.webp`),
        null
      );
      manifest.push(entry);
      total += entry.bytes;
    }
    console.log(`✓ ${locale}  ${HERO[locale].length} hero + ${AGE_BANDS.length} age bands`);
  }

  writeFileSync(
    join(OUT_ROOT, "manifest.json"),
    JSON.stringify({ generatedBy: "tools/assets/portraits.ts", entries: manifest }, null, 2) + "\n"
  );

  console.log(
    `\nDone. ${manifest.length} files, ${(total / 1024 / 1024).toFixed(2)} MB total. ` +
      `Manifest at src/assets/portraits/manifest.json`
  );
}

await main();
