# TODOS

Reporté depuis la revue `/autoplan` du 2026-08-30 et les lots P0, #1, #2, #3, #4.
Chaque entrée porte sa preuve et son déclencheur de reprise : sans déclencheur,
une intention différée est une intention perdue.

---

## Bloquant avant tout lancement réel

### ~~AUTH_SECRET et DATABASE_URL absents de Vercel~~ CORRIGÉ

`/api/auth/session` renvoyait 500 `MissingSecret` : personne ne pouvait se
connecter ni s'inscrire. Les six variables (`AUTH_SECRET`, `DATABASE_URL`,
`DIRECT_URL` × production et preview) sont posées, la base Supabase est
migrée et semée. Vérifié en production par une connexion réelle : le POST sur
`/api/auth/callback/credentials` renvoie une session, et `/fr/talents/app`
affiche les données du compte de démo.

**Corrigé :** v0.3.0.0 (2026-08-31).

### ~~Infrastructure — le stockage ne survit pas à Vercel~~ CORRIGÉ

Les deux moitiés sont faites : Postgres sur Supabase (eu-west-1) pour les
données, Cloudflare R2 (bucket `agental-media`, EU) pour les fichiers.
`src/lib/storage/local.ts` reste le chemin de développement ; les quatre
variables `R2_*` sélectionnent `R2Storage` en production, et une configuration
partielle est refusée au lieu de retomber silencieusement sur un disque
éphémère.

Les lectures passent par une URL signée de 5 minutes plutôt que par la
fonction : un self-tape de 50 Mo n'a plus à tenir en mémoire d'une fonction
serverless puis à y être recopié pour la réponse.

Vérifié contre le vrai bucket, pas déduit : écriture, relecture octet pour
octet, `fetch` de l'URL signée en 200 avec contenu identique, suppression, et
une clé absente qui renvoie `null` sans lever d'exception.

**Corrigé :** v0.3.0.0 (base) et v0.3.1.0 (fichiers), 2026-08-31.

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

### ~~B12 — Le matching IA est inopérant~~ CORRIGÉ, et l'entrée était fausse

**Le constat d'origine était erroné.** Cette entrée affirmait que
`model: "claude-opus-4-8"` était un identifiant inexistant. Il est valide :
c'est Claude Opus 4.8. L'affirmation venait de la revue `/autoplan`, n'a jamais
été vérifiée, et a été recopiée ici telle quelle.

Le vrai défaut était l'autre moitié de l'entrée, celle qui était juste : tout
échouait en silence. `getScorer()` renvoyait le mock quand `SCORER=llm` était
demandé sans clé, et `LlmScorer.score()` avalait toute exception sans un log.
Un déploiement convaincu d'avoir activé le matching IA servait donc des scores
déterministes, chacun accompagné d'une justification rédigée en français, à un
directeur de casting — indiscernables d'un vrai matching.

Désormais : `SCORER=llm` sans clé est refusé au démarrage avec un message qui
dit quoi faire ; un échec à l'exécution (limite de débit, refus, réponse hors
schéma) continue de retomber sur le mock, parce qu'il ne faut pas casser un
brief en cours, mais il est journalisé à chaque fois. Le modèle passe à
`claude-opus-5` — même tarif qu'Opus 4.8, plus capable. Couvert par
`tests/lib/scorer-selection.test.ts`.

**Corrigé :** v0.3.2.0 (2026-08-31).

### B16 — `ExternalTalent` n'a pas de colonne de tenant — VÉRIFIÉ le 2026-08-31

Le constat structurel tient. `prisma/schema.prisma` : le modèle a `id`, `name`,
`agency`, `data`, `createdAt` et rien d'autre — **aucune colonne
d'organisation**. `src/app/actions/brief.ts:105` fait
`prisma.externalTalent.findMany()` **sans le moindre filtre**. Les lignes
retenues deviennent des `Candidature` sur le projet du demandeur, et
`projets/[id]/page.tsx:84-88` en rend le `name` et le `data`.

**Mais l'impact décrit ne peut pas se produire aujourd'hui.** Aucun chemin de
code ne crée d'`ExternalTalent` : le seul point de création du dépôt est
`prisma/seed.ts:81`, et la base de production en contient une ligne. Il n'y a
pas encore de fonctionnalité de sourcing. Le défaut est donc réel et dormant,
pas actif — il devient une fuite le jour où l'ingestion existe, pas avant.

**Trouvé en vérifiant, absent du constat d'origine :** `data` porte, de l'aveu
du schéma, « minimal PII / features » — des données personnelles de personnes
qui ne se sont jamais inscrites. C'est une question RGPD distincte de la
question de tenant, et elle se pose dès la première ligne ingérée, même sans
problème de cloisonnement.

**Déclencheur :** avant d'écrire la moindre ligne de sourcing hors-roster. La
colonne et le filtre coûtent quelques minutes maintenant, une migration avec
reprise de données plus tard.

### E-C4 — Le français hors d'atteinte de l'i18n — VÉRIFIÉ, et c'est deux problèmes

Le constat tient, mais il mélangeait deux choses dont le coût n'a rien à voir.

**1. Les justifications de matching — persistées.** `src/lib/ai/scorer.ts:111`
assemble `Classé ici : …` à partir de fragments français codés en dur
(`:65` « accent … natif », `:77` « âge dans la fourchette », `:91`
« disponibilité confirmée », « droits image OK »), et le prompt système de
`llm-scorer.ts` exige explicitement du français. `brief.ts:215` écrit ça dans
`MatchScore.justification`, et `shortlist-board.tsx:192` le rend tel quel. Un
directeur de casting anglophone lit du français dans sa shortlist.

**Mais la reprise de données est bien plus petite qu'annoncé.** `brief.ts:220`
est un `upsert` dont la branche `update` **réécrit** `justification` : relancer
un matching régénère le texte. Seules restent figées les lignes de projets que
personne ne relance. Le vrai travail est le changement de contrat — faire
renvoyer au `Scorer` des clés structurées (`{ reasons: ReasonKey[] }`) rendues
côté client — pas une migration.

**2. ~~Les conseils de self-tape~~ CORRIGÉ (v0.3.2.1).** Le scorer renvoie
désormais des clés (`TipKey`, dérivée du fichier de messages comme `ErrorKey`),
et le client les rend dans la langue du visiteur. Corrigé au passage : la ligne
« Cadrage · Lumière · Son » juste au-dessus était codée en dur alors que les
clés existaient, et le paramètre du `.map()` s'appelait `t`, masquant la
fonction de traduction — rien n'aurait pu être traduit à cet endroit sans le
renommer.

**Déclencheur :** le point 1 dès qu'un directeur de casting non francophone
ouvre une shortlist.

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
