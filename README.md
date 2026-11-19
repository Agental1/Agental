# Agental

Agence artistique nativement augmentée par IA. Deux portails sur une seule base de code :

- **Talents** (B2C, tutoiement, peau claire) — `/[locale]/talents/**`
- **Casting** (B2B, vouvoiement, peau sombre) — `/[locale]/casting/**`

Next.js 16 (App Router, webpack), next-intl, Prisma 7 + PostgreSQL (Supabase), Cloudflare R2
pour les médias, Tailwind v4, Vitest, bun.

> **Lisez `AGENTS.md` avant d'écrire du code.** Cette version de Next.js diffère des
> conventions courantes ; la doc de référence est embarquée dans
> `node_modules/next/dist/docs/`.

## Démarrer

Prérequis : [bun](https://bun.sh) ≥ 1.2. Node n'est pas nécessaire.

```bash
bun install                       # `postinstall` lance prisma generate
cp .env.example .env              # puis renseigner les 4 valeurs ci-dessous
openssl rand -base64 32           # une valeur pour AUTH_SECRET
bun run db:migrate                # applique les migrations sur votre base
bun run db:seed                   # jeu de démo FR (idempotent)
bun run dev                       # http://localhost:3000
```

Il faut une base PostgreSQL. La production tourne sur Supabase et le développement
local vise la même chose : un environnement local qui exerce un autre moteur que la
production ne prouve rien sur la production. Récupérez les deux chaînes de connexion
dans Supabase → Project Settings → Database :

- `DATABASE_URL` — **Transaction pooler**, port 6543. C'est ce que lit l'application.
- `DIRECT_URL` — connexion directe, port 5432. Seul `prisma migrate` s'en sert : le
  pooler ne supporte pas les instructions de session dont le DDL a besoin.

Les médias (photos, bandes démo, self-tapes) vont sur Cloudflare R2 en production.
En local, laissez les quatre variables `R2_*` vides : les fichiers atterrissent dans
`.uploads/`, ce qui convient au développement. Renseignez-les toutes ou aucune —
une configuration partielle est refusée au démarrage plutôt que de retomber
silencieusement sur un disque que l'hébergeur efface à chaque déploiement.

`bun install` seul ne suffit pas : `src/generated/` est gitignoré et le client Prisma est
généré au `postinstall`. Sans `DATABASE_URL`, l'application refuse de démarrer avec un
message qui dit quoi faire — elle retombait avant sur un fichier SQLite absent, ce qui
donnait un déploiement d'apparence saine qui échouait à la première requête.

### Comptes de démonstration

Mot de passe commun : `demo1234`. Le seed refuse de tourner sans `ALLOW_DEMO_SEED=true` (déjà posé par `bun run db:seed`) : ne le lancez jamais contre une base réelle. `bun run db:purge-demo` retire ces comptes d'une base (simulation par défaut, `-- --apply` pour supprimer).

| Rôle | Email |
|------|-------|
| Talent | `yann@demo.agental.co` |
| Casting | `demo-casting@demo.agental.co` |
| Admin | `demo-admin@demo.agental.co` |

Le compte admin ouvre `/admin` (audit, dossiers mineurs, guide de style). Sans lui, les
surfaces protégées sont inatteignables sur une base fraîche.

## Scripts

| Commande | Effet |
|----------|-------|
| `bun run dev` | Serveur de développement |
| `bun run build` / `start` | Build de production et service |
| `bun run test` / `test:watch` | Tests unitaires et d'intégration (Vitest) |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | ESLint |
| `bun run i18n:check` | Parité des clés de traduction + détection de fuite de français |
| `bun run a11y:check` | Aucune cible interactive sous 24×24 px à 375 px (WCAG 2.5.8 AA) |
| `bun run db:migrate` / `db:deploy` / `db:seed` / `db:studio` | Prisma (`db:deploy` = migrations en production) |
| `bun run extract` | Pipeline d'extraction des assets de charte |

### Tests

`tests/` couvre la logique que le typage ne peut pas garantir : la réconciliation
des shortlists, la conversion des erreurs de server action, le formatage `Intl`
par locale et la construction des URLs SEO. S'y ajoutent deux invariants entre
modules que rien ne relie dans le code : `tests/domain/specialties.test.ts` exige
qu'à chaque landing SEO de `src/data/casting-types.ts` réponde une spécialité du
`SpecialtyKind` de `src/domain/enums.ts` — un slug ajouté d'un seul côté livre une
page indexée que le formulaire d'inscription refuse — et
`tests/data/portraits.test.ts` exige une légende par portrait dans
`messages/<locale>/talents.json` et une image par tranche d'âge, dans les quatre
locales. `tests/api/media-access.test.ts` est un test d'intégration contre la
vraie base — le risque y est la forme de la requête d'appartenance, qu'un mock
Prisma ne prouverait pas. Il crée ses lignes sous un préfixe et les supprime en
`afterAll`.

Ce qu'un test unitaire ne peut pas atteindre est couvert par les deux gardes
navigateur ci-dessous : tailles rendues, contraste, fuites de langue.

### Garde d'accessibilité

`a11y:check` pilote un Chromium via Playwright. Une seule installation :

```bash
bunx playwright install chromium
```

Le seuil par défaut est **24 px**, celui de WCAG 2.5.8 (niveau AA) — pas 44,
qui relève de SC 2.5.5 (AAA) et des recommandations Apple. `--min 44` mesure
l'écart de confort sans le rendre bloquant. `--base <url>` vise un autre
serveur : le lancer contre `next dev` est lent, la compilation à froid de
chaque route dépassant le délai ; préférez `bun run build && bun run start`.

## Mode démo (`?demo`)

Une visite scriptée du site public pour l'enregistrement d'écran (points
d'étape, vidéos de pitch). Ouvrez `/en/talents?demo` — en local ou en
production —, démarrez l'enregistreur, cliquez n'importe où. Environ 35 s ;
`R` relance, `Échap` quitte. Aucune base de données ni connexion n'est
nécessaire : la visite ne passe que par les landings.

- `src/components/demo/demo-script.ts` — les scènes, légendes et durées. C'est
  le seul fichier à toucher pour changer la prise.
- `src/components/demo/demo-player.tsx` — le lecteur (légendes, cartes,
  primitives `goto`, `scrollTo`, `highlight`, `type`, `click`).
- Les pages portent des ancres `data-demo="…"`. Renommer ou retirer une ancre
  arrête la visite avec `[demo] element not found` dans la console.

## Internationalisation

Quatre locales, définies dans `src/i18n/routing.ts` : `en` (défaut), `fr`, `es`, `zh`
(chinois simplifié). **Chaque locale porte son préfixe**, l'anglais compris — les URLs
sont `/en/talents`, `/fr/talents`, `/es/talents`, `/zh/talents`, et aucune route non
préfixée n'existe. Une URL sans préfixe est négociée vers la langue du visiteur ; à
défaut, l'anglais. Le segment d'URL reste court (`zh`) mais `<html lang>` et hreflang
portent l'écriture (`zh-Hans`) : voir `LANG_TAG` dans le même fichier.

Le chinois a ses propres règles typographiques dans `globals.css` (section *Chinese
typesetting*) : pas d'interlettrage négatif, interlignage plus ouvert, titres coupés
aux signes de ponctuation plutôt qu'entre deux idéogrammes. Un wordmark latin qui doit
garder son interlettrage serré porte la classe `brand-type`.

Cette négociation vit dans `src/proxy.ts` — pas `src/middleware.ts` : Next 16 a renommé la
convention de fichier. C'est le seul endroit où la locale d'une requête est résolue.
N'ajoutez pas de `redirects()` équivalents dans `next.config.ts` : Next les applique avant
le proxy et court-circuiterait la négociation.

Les messages vivent dans `messages/<locale>/` et sont découpés par **registre**, pas par
page : `talents.json` tutoie (« 你 » en chinois), `casting.json` vouvoie (« 您 »), `common.json` est neutre, `app.json`
sert l'application connectée (actions, états, erreurs). Choisir le mauvais namespace produit
du texte au mauvais ton.

`src/global.d.ts` type les messages depuis l'anglais (locale par défaut) : une clé absente ou mal
orthographiée échoue au `typecheck` au lieu de s'afficher à un visiteur.

**N'importez jamais** `redirect`, `useRouter`, `usePathname` de `next/navigation`, ni
`Link` de `next/link` — ils ignorent la locale et renvoient l'utilisateur en français.
Utilisez `@/i18n/navigation`. Une règle ESLint le fait respecter.

**Les server actions renvoient une clé, jamais une phrase.** Un message traduit sur le
serveur fige la langue au moment où l'action s'exécute. Renvoyez `err("errors.…")` depuis
`src/domain/action-result.ts` — les clés sont typées depuis `messages/en/app.json`, donc une
clé inexistante échoue au `typecheck` — et laissez `<ActionErrorMessage>`
(`src/components/app/action-error.tsx`) la traduire côté client, où la locale active est
connue.

## Architecture

Trois dépendances externes sont derrière une **interface échangeable** avec une fabrique
paresseuse en cache, pour que le mock de développement et l'implémentation de production
soient interchangeables sans toucher aux appelants :

| Interface | Dev | Production visée |
|-----------|-----|------------------|
| `src/lib/billing/index.ts` | `MockBilling` | Stripe |
| `src/lib/storage/index.ts` | disque local `.uploads/` | R2 / S3 |
| `src/lib/ai/scorer.ts` | `MockScorer` | `LlmScorer` (`SCORER=llm`) |

Suivez ce pattern pour toute nouvelle dépendance externe — mais **échouez bruyamment** à
la configuration manquante plutôt que de retomber silencieusement sur le mock.

`src/lib/seo.ts` porte `SITE`, l'unique origine canonique. Ne codez jamais un domaine en
dur : `metadataBase`, le sitemap et `robots.txt` doivent tous en dériver.

## Le reste de la documentation

| Fichier | Contenu |
|---------|---------|
| [`AGENTS.md`](AGENTS.md) | À lire avant d'écrire du code : cette version de Next.js diffère des conventions courantes |
| [`CHANGELOG.md`](CHANGELOG.md) | Ce qui a changé, version par version |
| [`TODOS.md`](TODOS.md) | Le travail différé, avec sa preuve et son déclencheur de reprise — dont deux points bloquants avant toute mise en ligne |
| `VERSION` | La version courante, à quatre composants (`package.json` n'en accepte que trois) |
