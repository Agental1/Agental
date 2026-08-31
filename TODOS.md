# TODOS

Reporté depuis la revue `/autoplan` du 2026-08-30 et les lots P0, #1, #2, #3, #4.
Chaque entrée porte sa preuve et son déclencheur de reprise : sans déclencheur,
une intention différée est une intention perdue.

---

## Bloquant avant tout lancement réel

### Infrastructure — le stockage média ne survit pas à Vercel

`prisma/schema.prisma` déclare `provider = "sqlite"` avec un `dev.db` commité, et
`src/lib/storage/local.ts:5` écrit dans `<cwd>/.uploads`. Le système de fichiers
Vercel est éphémère hors `/tmp` : **les self-tapes disparaîtraient à chaque
redéploiement**. `agental.co` pointe déjà sur un projet Vercel (404
`DEPLOYMENT_NOT_FOUND` au 2026-08-30), donc la cible est connue.

Les interfaces échangeables existent déjà et annoncent le swap en commentaire :
`src/lib/storage/index.ts` (→ R2/S3) et `src/lib/db.ts` (→ Postgres/Turso).

**Déclencheur :** avant le premier déploiement qui accepte un upload réel.

### ~~/api/media/[id] sans authentification~~ CORRIGÉ

Le handler diffusait n'importe quelle ligne `Media` à qui connaissait un id.
Corrigé lors de la revue du 2026-08-31 : lecture réservée au talent
propriétaire, aux organisations ayant une candidature sur le profil, et à
l'administration. Couvert par `tests/api/media-access.test.ts`, qui vérifie
notamment qu'une organisation tierce est refusée.

**Corrigé :** v0.2.0.0 (2026-08-31).

### Mentions légales, CGU, politique de confidentialité

`src/components/marketing/footer.tsx` rend ces trois entrées en texte inerte :
ni liens, ni routes. Une agence artistique déclarée en préfecture en a besoin, et
l'ajout de l'instrumentation d'audience (lot #2, sans cookie) rend une notice de
confidentialité attendue même sans bandeau de consentement.

Non fait parce que c'est du texte juridique, qui ne s'invente pas.

**Déclencheur :** avant d'ouvrir le site au public.

---

## Défauts critiques hors périmètre des 5 lots

### B12 — Le matching IA est inopérant

`src/lib/ai/llm-scorer.ts:37` → `model: "claude-opus-4-8"`. Cet identifiant de
modèle n'existe pas. La fonctionnalité phare de la Phase 6 échoue dès que
`SCORER=llm`, et personne ne l'a vu parce que `getScorer()`
(`src/lib/ai/scorer.ts:131`) retombe **silencieusement** sur `MockScorer`.

Deux correctifs, pas un : l'identifiant, et le repli qui doit devenir bruyant.

**Déclencheur :** avant d'activer `SCORER=llm` en production.

### B16 — `ExternalTalent` n'a pas de colonne de tenant

`src/app/actions/brief.ts:102` fait `prisma.externalTalent.findMany()` sans
filtre. Chaque organisation de casting voit donc **toute** personne hors-roster
de la base, avec un score IA et une justification écrite. Ce n'est pas un `where`
manquant : le modèle n'a pas de `organizationId` (`prisma/schema.prisma:303-311`).
Migration de schéma plus reprise de données.

**Déclencheur :** avant d'ouvrir un second marché, ou toute revue RGPD.

### E-C4 — Le français est persisté en base, hors d'atteinte de l'i18n

`src/app/actions/brief.ts:164` écrit `MatchScore.justification`, une chaîne
générée en français par `src/lib/ai/scorer.ts:110` ou par le prompt système de
`llm-scorer.ts:37-45`, qui exige explicitement du français. Rendue brute dans
`shortlist-board.tsx:192`. Même schéma côté Talents avec les `tips` de
`quality-scorer.ts:35-39`.

**Aucune extraction ne peut l'atteindre** : le correctif est de faire renvoyer au
contrat `Scorer` une justification **structurée** (`{ reasons: ReasonKey[] }`)
rendue côté client, plus une stratégie de reprise des lignes existantes.

**Déclencheur :** dès qu'un directeur de casting non francophone ouvre une
shortlist.

### `onboarding.ts:146` — la commission réduite n'est jamais appliquée

Les entrées de carrière sont créées avec `commissionRate: 0.1` en dur, quel que
soit le plan. Les paliers Premium (7,5 %) et Ultimate (5 %) sont affichés et
facturés mais pas appliqués au calcul.

**Déclencheur :** avant le premier versement de cachet réel.

---

## Produit

### La face demande n'a pas de porte d'entrée

Le portail Casting — le vrai goulot d'étranglement d'après la revue CEO — est
atteignable depuis un seul endroit : le `crossLink` de `header.tsx`. La racine
`/` redirige vers Talents sans jamais proposer le choix.

**Déclencheur :** dès que l'instrumentation montre du trafic offre qui ne se
convertit pas en briefs.

### Quotas de candidatures vendus mais non implémentés

`dailyCandidatureLimit` (`src/domain/pricing.ts:11,15-18`) n'a aucun lecteur.
Le discours commercial a été aligné (lot #2 et lot #4) : les pages tarifs, la
FAQ et l'écran d'abonnement décrivent désormais ce qui existe. Le champ de
données reste, donc rien n'est perdu si la fonctionnalité arrive.

Il n'existe par ailleurs aucun écran d'opportunités côté talent, ni flux
candidater/refuser. Et le modèle `Notification` a **zéro référence** dans `src/` :
un talent inscrit n'est jamais recontacté par quoi que ce soit.

**Déclencheur :** quand vous décidez si l'auto-candidature est un vrai produit.

### ~~`brief.ts:150` — relancer un matching détruit le travail~~ CORRIGÉ

Le `deleteMany` avant recréation effaçait statuts de shortlist, timeline et
`appliedAt`. Corrigé lors de la revue `/review` du 2026-08-31, pas au lot #2
comme cette entrée l'affirmait à tort : la revue a constaté que le correctif
n'avait jamais été écrit.

La reconciliation se fait en code, faute d'index unique sur (projectId, talent)
et parce qu'ajouter une migration était hors périmètre. Les statuts NEW et
SHORTLISTED appartiennent au matcher et peuvent être remplacés ; tout autre
statut signifie qu'un humain a décidé, et survit à une relance.

**Corrigé :** v0.2.0.0 (2026-08-31). Couvert par
`tests/domain/shortlist.test.ts`.

---

## Différés lors de la revue

| Item | Pourquoi | Déclencheur |
|------|----------|-------------|
| **Lot #5 — blog Sanity** | Différé par le demandeur le 2026-08-31. Compatibilité vérifiée : `next-sanity@13.3.3` supporte Next 16 et React 19.2.4 ; il faudrait ajouter `styled-components ^6.1.15`. Reste à trancher : ce repo build en `--webpack`, pas Turbopack | Quand vous voulez vraiment publier. Voir aussi l'alternative ci-dessous |
| **Landings programmatiques ville × type** | Alternative au blog soulevée par la revue CEO : sur ce marché, la requête qui convertit est « casting figuration Paris octobre », une requête de **listing**, pas de blog. Ce contenu se génère depuis la table `Project` et se rafraîchit tout seul | À comparer au blog avant de choisir |
| **Prévisualisation Sanity (draft mode)** | Orthogonal à la publication | Quand un rédacteur non technique publie à l'aveugle |
| **Stripe** | Verrouillé hors périmètre. `src/lib/billing/mock.ts` accorde tout plan pour 0 € | Avant tout encaissement réel |
| **Confort tactile 44 px** | Le AA (24 px) passe sur 42 pages. 171 cibles restent sous 44 px — chips, logos, boutons `md`. Les y amener change la hauteur de tous les boutons | `bun run a11y:check -- --min 44` mesure l'écart quand vous voudrez le regarder |
| **Relecture humaine EN/ES des espaces connectés** | Choix C3 : vous relisez le marketing, le reste part généré. Environ 600 clés non relues | Avant de communiquer sur le trilingue |
| **`global-error.tsx` non localisé** | Impossible : il remplace le root layout, donc pas de provider intl, pas de params, pas de police. Assumé et documenté dans le fichier | Aucun — c'est une limite du framework |
| **Migration des types de projet vers des ids** | `Organization.scope` stocke les libellés **français** ; ils sont affichés traduits via une table `{ id, value }`. Basculer le stockage exige de rejouer les organisations existantes | Si une quatrième langue arrive |
