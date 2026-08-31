# Agental

Agence artistique nativement augmentée par IA. Deux portails sur une seule base de code :

- **Talents** (B2C, tutoiement, peau claire) — `/[locale]/talents/**`
- **Casting** (B2B, vouvoiement, peau sombre) — `/[locale]/casting/**`

Next.js 16 (App Router, webpack), next-intl, Prisma 7 + libSQL/SQLite, Tailwind v4, bun.

> **Lisez `AGENTS.md` avant d'écrire du code.** Cette version de Next.js diffère des
> conventions courantes ; la doc de référence est embarquée dans
> `node_modules/next/dist/docs/`.

## Démarrer

Prérequis : [bun](https://bun.sh) ≥ 1.2. Node n'est pas nécessaire.

```bash
bun install                       # `postinstall` lance prisma generate
cp .env.example .env              # puis renseigner AUTH_SECRET
openssl rand -base64 32           # une valeur pour AUTH_SECRET
bun run db:migrate                # crée dev.db et applique les migrations
bun run db:seed                   # jeu de démo FR (idempotent)
bun run dev                       # http://localhost:3000
```

`bun install` seul ne suffit pas : `src/generated/` est gitignoré et le client Prisma est
généré au `postinstall`. Sans `.env`, `prisma` échoue sur
`PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`.

### Comptes de démonstration

Mot de passe commun : `demo1234`.

| Rôle | Email |
|------|-------|
| Talent | `yann@demo.agental.co` |
| Casting | `demo-casting@demo.agental.co` |
| Admin | `demo-admin@demo.agental.co` |

Le compte admin ouvre `/admin` (audit, dossiers mineurs). Sans lui, les surfaces
protégées sont inatteignables sur une base fraîche.

## Scripts

| Commande | Effet |
|----------|-------|
| `bun run dev` | Serveur de développement |
| `bun run build` / `start` | Build de production et service |
| `bun run test` | Tests unitaires et d'intégration (Vitest) |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | ESLint |
| `bun run i18n:check` | Parité des clés de traduction + détection de fuite de français |
| `bun run a11y:check` | Aucune cible interactive sous 24×24 px à 375 px (WCAG 2.5.8 AA) |
| `bun run db:migrate` / `db:seed` / `db:studio` | Prisma |
| `bun run extract` | Pipeline d'extraction des assets de charte |

### Tests

`tests/` couvre la logique que le typage ne peut pas garantir : la réconciliation
des shortlists, la conversion des erreurs de server action, le formatage `Intl`
par locale et la construction des URLs SEO. `tests/api/media-access.test.ts` est
un test d'intégration contre la vraie base — le risque y est la forme de la
requête d'appartenance, qu'un mock Prisma ne prouverait pas. Il crée ses lignes
sous un préfixe et les supprime en `afterAll`.

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

## Internationalisation

Locales dans `src/i18n/routing.ts`. Les messages vivent dans `messages/<locale>/` et sont
découpés par **registre**, pas par page : `talents.json` tutoie, `casting.json` vouvoie,
`common.json` est neutre. Choisir le mauvais namespace produit du texte au mauvais ton.

`src/global.d.ts` type les messages depuis le français : une clé absente ou mal
orthographiée échoue au `typecheck` au lieu de s'afficher à un visiteur.

**N'importez jamais** `redirect`, `useRouter`, `usePathname` de `next/navigation`, ni
`Link` de `next/link` — ils ignorent la locale et renvoient l'utilisateur en français.
Utilisez `@/i18n/navigation`. Une règle ESLint le fait respecter.

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
