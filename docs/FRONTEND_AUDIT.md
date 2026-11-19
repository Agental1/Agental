# Front-end audit (Phase 0)

Written 2026-11-18 on branch `frontend-redesign`, cut from `feat/limelight-green-room` (the version live on agental.co). It describes the code as found, before any redesign work. Task IDs refer to the front-end brief.

## The stack as found, and where it differs from the brief

| The brief says | The code has | Consequence |
|---|---|---|
| Supabase Auth | NextAuth v5 with a Credentials provider and JWT sessions (`src/auth.ts`). Supabase is the Postgres database, reached through Prisma. | Password rules, email verification and reset (F5.1 to F5.3) are server actions in this repo, owned by the backend session. |
| Supabase Storage | Cloudflare R2 behind `src/lib/storage`, served with signed URLs (`src/lib/media-access.ts`) | F6.1 saves to R2. Presigned uploads are planned in `docs/MEDIA_HOSTING.md` on the backend branch. |
| Stripe subscription flow | A mock billing provider (`src/lib/billing/mock.ts`, `src/lib/billing/index.ts`). Stripe is not wired. | The plan switcher (F3.4) and the student discount (F4.3) call the existing billing interface; real checkout is a handoff item. |
| `data-theme` on the root | `data-portal="talents"` or `"casting"`, set by each route-group layout and read by every token in `src/app/globals.css` | Kept as the single theme switch. Renaming the attribute would touch every layout for no visible gain. |
| An existing i18n system, maybe | next-intl, four locales (en, fr, es, zh), every key required in all four (`bun run i18n:check`) | New copy lands in all four locales. |

## Routes

Every route is prefixed by the locale (`/en`, `/fr`, `/es`, `/zh`). The path segments are French in every locale, including English (`/en/talents/tarifs`).

**Public site**

| Route | Page |
|---|---|
| `/` | Two-door entry: "I'm a performer" and "I cast roles" (`src/app/[locale]/page.tsx`) |
| `/talents` | Talent landing |
| `/talents/comment-ca-marche` | How it works |
| `/talents/tarifs` | Pricing |
| `/talents/faq` | FAQ |
| `/talents/qui-sommes-nous` | About |
| `/talents/limelight` | Limelight by Agental |
| `/castings`, `/castings/[type]` | Casting types, shown in the Talent navigation |
| `/casting` | Casting landing |
| `/casting/comment-ca-marche`, `/casting/tarifs`, `/casting/faq` | Casting how it works, pricing, FAQ |
| `/connexion` | Sign in, shared by both audiences (`(auth)` group) |
| `/talents/inscription`, `/casting/inscription` | Sign-up and onboarding wizards (`(flow)` groups) |

**Talent app** (`talents/(space)/app`): dashboard, `profil`, `candidatures`, `self-tape`, `carriere`, `abonnement`, `messages`, `parametres`.

**Casting app** (`casting/(space)/app`): dashboard, `projets/nouveau`, `projets/[id]`, `projets/[id]/talent/[cid]`, `abonnement`, `parametres`.

**Admin**: `/admin`, `/admin/audit`, `/admin/mineurs`, `/admin/styleguide`.

## Where the look is defined

- `src/app/globals.css` (762 lines) is the only token file: raw palette in `:root`, semantic roles (`--bg`, `--fg`, `--accent`, `--cta`...) remapped under `[data-portal="talents"]` and `[data-portal="casting"]`, then exposed to Tailwind 4 through `@theme inline`. Components read roles (`bg-bg`, `text-fg`, `bg-cta`), so a palette change is mostly a change to this file.
- Talent today: sand `#ece3d3`, white, green `#1f5c47` ("Green room"). Casting today: ink `#0e0e0e` with an orange signal `#ff5317`.
- Fonts are loaded in `src/app/[locale]/layout.tsx`: Geist Sans and Geist Mono (package `geist`), Instrument Sans and Big Shoulders Display (`src/assets/fonts`). All four go away with F1.2.
- Radii: `--sedan-sm` to `--sedan-2xl` (10 to 32px), `--btn-radius` and `--chrome-radius`. The Talent side overrides them to 4 to 18px, with 6px buttons, which is the "too square" feel F1.3 names.
- Buttons: `src/components/ui/button.tsx`. Cards, inputs, dialogs, tabs and badges sit beside it in `src/components/ui`.
- Motion: scroll-driven effects in `globals.css` (tape strip under titles, sepia "darkroom" reveal on photos, stage drift, the Limelight site that assembles itself, a pinned horizontal strip) with a fallback in `src/components/talents/scroll-motion.tsx`. F1.5 removes the scroll-tied ones.
- Layouts that set the theme: `talents/(site)`, `talents/(flow)`, `talents/(space)`, `casting/(site)`, `casting/(flow)`, `casting/(space)`, `castings`, `(auth)`, `admin`. The entry page and `(auth)` carry no `data-portal` and fall back to the Talent skin.

## Logos to replace (F1.6)

| What | Where |
|---|---|
| Four-point star (the Gemini-like mark), `AgentalMark` | `src/components/brand/logo.tsx`; used by the entry page, `[locale]/error.tsx`, `casting/(space)/not-found.tsx`, and inside `AgentalLogo` wherever the mark is "star" (Casting header, auth, admin, Casting sign-up) |
| The "T" placeholder, `TapeMark` | `src/components/brand/logo.tsx`; Talent header, Talent app sidebar, and as a CSS mask (`--tape-mark`, `.tape-mark`, the Talent `.eyebrow::before`) in `globals.css` |
| App icon and Apple icon | `src/app/icon.tsx` and `src/app/apple-icon.tsx` draw the star in brown on beige |
| `favicon.ico` | `src/app/favicon.ico` |
| Web manifest | `src/app/manifest.ts`: beige `#f8f4ec`, brown `#6e4527`, and a French description |
| Open Graph image | `src/app/[locale]/opengraph-image.tsx`, drawn in the old colors |

The three logo files named in the brief did not reach this session. `/brand` does not exist yet.

## French strings in the English UI (F3.6)

Hard-coded in components, so they show in every locale:

- `src/components/talents/self-tape-studio.tsx:243-245`: "Cadrage", "Lumière", "Son"
- `src/app/[locale]/talents/(space)/app/carriere/page.tsx:49-51`: "Cachets bruts", "Net perçu", "Commission Agental"
- `src/app/[locale]/talents/(space)/app/parametres/page.tsx:76` and `casting/(space)/app/parametres/page.tsx:66`: "Abonnement"
- `src/components/app/profile-editor.tsx:157`: "Enregistrer" (file being edited by the backend session)
- `src/components/app/rgpd-section.tsx:85`: "Annuler"
- `src/app/[locale]/admin/page.tsx:63`: "Candidatures"
- `src/app/manifest.ts`: French description

The English message files are clean. A full sweep of the signed-in pages for more hard-coded strings is part of F3.6.

URL segments are French in the English site (`tarifs`, `connexion`, `inscription`, `profil`, `candidatures`, `carriere`, `abonnement`, `parametres`, `comment-ca-marche`, `qui-sommes-nous`). next-intl can localize pathnames; this is recorded as an open decision because it changes every public URL.

## How things are wired

- **Sign in**: `/connexion` renders `src/components/auth/auth-form.tsx`, which calls `loginAction` in `src/app/actions/auth.ts`, then NextAuth `signIn`. After sign-in, `src/domain/auth-routes.ts` (`appHome`, `onboardingHome`) picks the destination by account kind.
- **Sign up**: `/talents/inscription` and `/casting/inscription` run the wizards in `src/components/onboarding`, backed by `signupAction` and `src/app/actions/onboarding.ts`. The Talent app layout sends anyone without an active signed mandate back to `/talents/inscription`.
- **Signed-in visitors on public pages**: no redirect today. F2.1 needs one; it belongs with the routing rules in `src/proxy.ts` or `auth-routes.ts`, which the backend session is changing.
- **Plans and pricing**: `src/domain/pricing.ts` holds the Talent plans (Free, Pro $19, Premium $49, Ultimate $79, with commission rates) and the Casting plans (Free, Pro $99 per seat, Studio $299, Enterprise). Plan names and feature lines live in `messages/*/talents.json` and `casting.json`. `src/components/marketing/pricing-grids.tsx` renders the public tables; `src/components/talents/plan-selector.tsx` and `src/components/casting/casting-plan-selector.tsx` change plans in the app through the mock billing provider. Limelight prices are in `src/domain/limelight.ts`.
- **Talent / Casting switch**: two links inside `src/components/marketing/header.tsx`. The active side links to its own home and the other side to `crossLink.href`. It exists on the `(site)` layouts only: the entry page, `/connexion`, `/castings` and both apps have no switch. The reported failure is still to be reproduced (F2.2).
- **App shell**: `src/components/app/app-sidebar.tsx` is `hidden` below 768px with nothing in its place, so the app has no navigation on a phone (F3.3). The shell is `mx-auto flex max-w-7xl` with the sidebar inside the centered box, which is why the sidebar moves away from the left edge when the browser zooms out (F3.2).

## Photos of people on public pages (F2.6)

`src/data/portraits.ts` maps generated portraits in `src/assets/portraits/{en,es,fr}`. They appear on the Talent landing (stage panel and two more spots), in `src/components/talents/join-steps.tsx`, on the Limelight page (sample site and the six-template strip) and on `/castings` and `/castings/[type]`. The illustrated agent is the "Your agent" chip in the Talent landing's stage panel.

## Points that need a decision

1. **Commission.** F6.2 says Agental takes no commission and earns subscriptions only. The code says otherwise in three places: `commissionRate` per plan in `src/domain/pricing.ts`, a "Commission" section on the Talent landing, and commission lines in the pricing copy. The Career page fix is in scope; the public pricing copy is a business decision, and the backend rules say prices and commission rates stay as they are.
2. **Logo files.** Needed for F1.6. Until they arrive, a plain "Agental" wordmark in Helvetica Bold stands in, and the star and the "T" are removed.
3. **French URL segments** in the English site, described above.
4. **Branch base.** The brief says to rebase on `main`. `main` lacks the Limelight page and the portal switch, so this branch is based on `feat/limelight-green-room` and will be rebased on `main` once PR #2 merges.
