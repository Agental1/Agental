# Agental brand files

| File | What it is | Where it is used |
|---|---|---|
| `agental-a-dark.svg` | The A monogram, blue and near-black | Light backgrounds: the Talent theme, Limelight, favicon |
| `agental-a-white.svg` | The A monogram, blue and white | Dark backgrounds: the Casting theme |
| `source/agental-monogram.webp` | The monogram as supplied (2026-11-18) | Reference only |
| `source/agental-wordmark.webp` | The "Agental" wordmark as supplied, with the blue bar in the A | Reference only: the wordmark is the company logo; the site sets "Agental" in Helvetica Bold beside the monogram until a vector file exists |

The site draws the monogram from `src/components/brand/logo.tsx` (`AgentalMark`), with the same shapes as the two SVG files here. The dark part uses the current text color, so one component serves both themes. App icons (32, 192 and 512px, and the 180px Apple icon) are generated from the same shapes in `src/app/icon.tsx` and `src/app/apple-icon.tsx`; the 32px one drops the two cuts so it stays legible.

Blue: `#246BFE`. Near-black: `#0B0F1A`.
