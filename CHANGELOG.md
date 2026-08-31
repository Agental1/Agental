# Changelog

Toutes les évolutions notables de ce projet. Format inspiré de
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [0.3.2.0] - 2026-08-31

### Fixed

- **Le matching IA échouait en silence.** `getScorer()` renvoyait le scorer
  déterministe quand `SCORER=llm` était demandé sans clé API, et
  `LlmScorer.score()` avalait toute exception sans un log. Un déploiement
  convaincu d'avoir activé le matching IA servait donc des scores calculés par
  une heuristique, chacun accompagné d'une justification rédigée, à un directeur
  de casting — rien ne les distinguait d'un vrai matching.

  `SCORER=llm` sans clé est maintenant refusé avec un message qui dit quoi
  faire. Un échec à l'exécution — limite de débit, refus du modèle, réponse hors
  schéma — continue de retomber sur le scorer déterministe, parce qu'il ne faut
  pas casser un brief en cours, mais il est journalisé à chaque fois.

### Changed

- Le modèle passe de `claude-opus-4-8` à `claude-opus-5` : même tarif, plus
  capable. **L'identifiant précédent était valide** — `TODOS.md` affirmait le
  contraire depuis la revue initiale, ce qui était faux et n'avait jamais été
  vérifié. L'entrée est corrigée.

## [0.3.1.5] - 2026-08-31

### Fixed

- **Le widget de rentabilité de l'abonnement était en français partout.** Phrase
  d'introduction, les quatre en-têtes du tableau et la mention « (actuel) ».
- **La commission s'affichait « 10 %% ».** `percent()` émet déjà le signe, et le
  gabarit en ajoutait un second. Visible dans les trois langues.

### Changed

- **La garde `i18n:check` ne s'arrête plus au premier `useTranslations`.** Elle
  exemptait du scan de texte JSX tout fichier qui en appelait un, sur
  l'hypothèse qu'un tel fichier était traduit. La traduction partielle est le
  cas courant, pas l'exception : c'est ainsi que l'éditeur de profil a gardé
  seize chaînes françaises tout en étant rapporté propre. Les commentaires sont
  maintenant retirés avant l'analyse — le motif de texte JSX traverse les
  retours à la ligne, donc un bloc de commentaire entre `>` et `<` se lisait
  comme du texte affiché.

  Restent deux signalements, tous deux assumés : le guide de style interne, non
  traduit et derrière la garde admin, et `global-error.tsx`, qui vit hors du
  provider intl et ne peut pas l'être.

## [0.3.1.4] - 2026-08-31

### Fixed

- **L'éditeur de profil restait en français dans les trois langues.** Les cinq
  onglets et onze libellés de champs étaient codés en dur : un anglophone sur
  `/en/talents/app/profil` lisait « Identité · Physique · Médias · Spécialités ·
  Préférences » au-dessus de « Nom artistique », « Corpulence », « Cachet
  minimum ». Seize chaînes passent dans `space.profileEditor`, traduites en
  anglais et en espagnol.

  La garde `i18n:check` ne pouvait pas le voir : elle exempte du scan de texte
  JSX tout fichier qui appelle `useTranslations`, et celui-ci en appelait déjà
  pour d'autres chaînes. Une exemption par fichier laisse passer les oublis
  partiels, qui sont le cas le plus courant.

## [0.3.1.3] - 2026-08-31

### Fixed

- **Les 18 appels à `revalidatePath` ne correspondaient à aucune route.** La
  fonction s'applique à l'arborescence des **fichiers**, pas aux URLs : elle
  attendait `/[locale]/talents/(space)/app/profil` et recevait
  `/talents/app/profil`. Vérifié plutôt que supposé — aucun des anciens chemins
  n'existe sur le disque, tous les nouveaux existent. Un appel qui ne
  correspond à rien n'émet ni avertissement ni erreur : il ne laisse que des
  données périmées, ce qui explique qu'ils aient survécu à une revue complète.

### Added

- **Deux gardes ESLint sur `revalidatePath`** : un chemin qui ne commence pas
  par `/[locale]/` est refusé, et le second argument (`"page"` ou `"layout"`)
  devient obligatoire, puisque toute route de ce projet contient le segment
  dynamique `[locale]`. Les deux règles ont été vérifiées sur des appels
  volontairement fautifs.
- **Un test qui vérifie que chaque chemin désigne une route réelle.** ESLint ne
  contrôle que la forme ; c'est un renommage de route qui recréera le problème,
  et lui seul peut l'attraper. Le test vérifie aussi qu'il trouve bien les
  appels, pour qu'un passage au vert veuille dire quelque chose.

## [0.3.1.2] - 2026-08-31

### Fixed

- **Se connecter ne menait nulle part.** Le formulaire créait bien la session,
  puis l'utilisateur restait sur la page de connexion — sans message, donc
  impossible à distinguer d'un mot de passe refusé. `redirectTo` était passé à
  NextAuth sans préfixe de locale (`/talents/app`), or NextAuth redirige vers
  cette valeur telle quelle : il ne connaît pas next-intl. Le routeur client
  allait chercher la charge RSC de `/talents/app`, le proxy répondait 307 vers
  `/fr/talents/app`, le routeur ne suivait pas, et rien ne se passait.
- **Même défaut à l'inscription**, et c'est là qu'il coûtait le plus cher : un
  anglophone qui créait son compte se retrouvait renvoyé vers l'onboarding
  français. `/en/talents/inscription` reste désormais en anglais.

  Les destinations sont extraites dans `src/domain/auth-routes.ts` — un module
  `"use server"` ne peut exporter que des fonctions async, donc rien n'y était
  testable. Sept tests couvrent les trois locales, les deux portails, et le
  repli sur la locale par défaut quand la valeur du formulaire est inconnue.

## [0.3.1.1] - 2026-08-31

### Fixed

- **La galerie de médias ne se mettait pas à jour après un ajout ou une
  suppression.** Le talent téléversait sa photo, ne la voyait pas apparaître, et
  recommençait. `ProfileEditor` faisait `useState(initial)` puis passait
  `data.media` à la galerie : `useState` ne lit son argument qu'au premier
  montage, donc chaque rendu serveur suivant — celui que `router.refresh()` va
  chercher après l'action — était jeté, et la galerie restait sur son premier
  instantané. Elle lit désormais `initial.media` directement. Les champs du
  formulaire, eux, sont bien un brouillon et restent sur `data`.

  Ni `revalidatePath` ni `router.refresh()` n'étaient en cause : vérifié en
  comparant une charge RSC fraîche du serveur, qui contenait déjà le nouveau
  média, au DOM, qui ne l'avait pas.

## [0.3.1.0] - 2026-08-31

### Added

- **Stockage des médias sur Cloudflare R2.** Photos, bandes démo et self-tapes
  étaient écrits dans `<cwd>/.uploads` : sur un hébergement serverless, le
  premier redéploiement les effaçait. L'interface `Storage` existait déjà et
  annonçait ce remplacement ; c'est un adaptateur de plus derrière elle, pas une
  refonte. Sélection par variables d'environnement, donc une préversion peut
  viser le même bucket sans changer une ligne de code.
- **Lecture par URL signée.** `/api/media/[id]` vérifie l'autorisation comme
  avant, puis redirige vers une URL R2 valable 5 minutes au lieu de faire
  transiter les octets. Un self-tape de 50 Mo n'a plus à tenir dans la mémoire
  d'une fonction, ni à être recopié dans la réponse. La redirection elle-même
  n'est jamais mise en cache : elle survivrait à la signature qu'elle porte.

  Bucket `agental-media`, localisation EU, pour rester avec la base Supabase
  eu-west-1. Vérifié contre le vrai bucket : écriture, relecture octet pour
  octet, `fetch` de l'URL signée en 200, suppression.

### Changed

- **Une configuration de stockage partielle est refusée.** Trois variables R2
  sur quatre, c'est une faute de frappe ; retomber sur le disque local dans ce
  cas « fonctionnerait » jusqu'au premier fichier disparu. En production, aucune
  configuration du tout est la même erreur, un cran plus tôt. Le message nomme
  les variables manquantes.
- Les dépendances `@prisma/adapter-libsql` et `@libsql/client`, devenues
  inutilisées avec le passage à Postgres, sont retirées.

## [0.3.0.0] - 2026-08-31

### Changed

- **La base passe de SQLite à PostgreSQL (Supabase),** en local comme en
  production. Le schéma avait été écrit portable exprès — pas d'enum natif, pas
  de `Json`, pas de liste scalaire, montants en centimes entiers — donc seul le
  `datasource` change : aucun modèle n'est touché. L'adaptateur `@prisma/adapter-libsql`
  devient `@prisma/adapter-pg`.
- **Les migrations SQLite sont remplacées par une migration Postgres unique.**
  Les trois précédentes étaient du DDL SQLite, inapplicable sur Postgres ;
  aucune base de production n'existait encore, donc rien n'est perdu. 27 modèles,
  27 tables, vérifié.
- **Deux chaînes de connexion, pas une.** `DATABASE_URL` vise le pooler de
  transactions (port 6543), que l'application utilise parce qu'une fonction
  serverless ouvre une connexion par invocation. `DIRECT_URL` vise la connexion
  directe (port 5432), que seul `prisma migrate` utilise : le pooler ne supporte
  pas les instructions de session dont le DDL a besoin.

### Fixed

- **Une base absente ne passe plus inaperçue.** `src/lib/db.ts` retombait sur
  `file:./dev.db`, un fichier gitignoré donc absent de tout déploiement : le
  site démarrait en paraissant sain et échouait à la première requête. La
  variable est désormais lue sans valeur de repli, et le message d'erreur dit
  quoi faire. Le build échoue franchement si elle manque, au lieu de livrer une
  application qui ne peut pas répondre.

## [0.2.0.2] - 2026-08-31

### Fixed

- **Chaque canonical pointait vers une redirection.** Le domaine apex
  `agental.co` répond 308 vers `www.agental.co`, mais l'origine par défaut de
  `src/lib/seo.ts` était l'apex : les 57 URLs du sitemap, les `canonical`, les
  `hreflang` et les URLs Open Graph déclaraient tous une adresse que le site ne
  sert pas. Une page qui se déclare canonique là où elle redirige se contredit.
  L'origine par défaut devient `https://www.agental.co`, réglable comme avant
  par `NEXT_PUBLIC_SITE_URL`.

## [0.2.0.1] - 2026-08-31

### Fixed

- **Le déploiement échouait avant même de compiler.** `prisma.config.ts`
  résolvait `DATABASE_URL` avec le helper `env()` de `prisma/config`, qui lève
  une exception au chargement de la configuration quand la variable est absente.
  Comme `postinstall` lance `prisma generate`, `bun install` sortait en 1 sur
  tout hôte de build — là où aucun `.env` n'existe — et le build ne démarrait
  jamais. `prisma generate` n'a pourtant besoin d'aucune base : seuls `migrate`
  et `db push` en ont besoin, et ils tournent là où la variable est définie. La
  configuration retombe désormais sur le même défaut que `src/lib/db.ts`.

## [0.2.0.0] - 2026-08-31

Le site devient réellement trilingue, du premier écran au tableau de bord, et
se déclare correctement aux moteurs de recherche.

### Added

- **Espagnol.** Trois langues servies : `/fr`, `/en`, `/es`. Chaque langue porte
  son préfixe, y compris le français, et une URL sans préfixe négocie vers la
  langue du visiteur au lieu de dépendre d'un cookie.
- **Traduction complète de l'application connectée.** Inscription, connexion,
  onboarding, espaces Talents et Casting, admin : plus une seule chaîne
  française codée en dur, attributs d'accessibilité compris.
- **Sélecteur de langue partout.** Il n'existait que dans l'en-tête marketing :
  la langue ne pouvait plus être changée une fois l'inscription commencée. Il
  affiche désormais les noms natifs (Français · English · Español) et conserve
  les paramètres d'URL.
- **SEO technique.** Balises `canonical`, `hreflang` pour les trois langues plus
  `x-default`, Open Graph et Twitter, avec une carte de partage générée par
  locale. Données structurées `Organization`, `Service`, `BreadcrumbList` et
  `FAQPage`.
- **Pages 404 et erreur**, dans la langue du visiteur et avec la navigation du
  site. Le framework servait jusque-là son écran par défaut, non stylé et en
  anglais.
- **Manifeste web et icônes d'application.** « Ajouter à l'écran d'accueil »
  produisait une vignette vide.
- **Mesure d'audience** sans cookie, désactivée tant qu'aucune variable
  d'environnement n'est posée.
- **Tests.** Vitest couvre la réconciliation des shortlists, les erreurs de
  server action, le formatage `Intl` et les URLs SEO ; un test d'intégration
  vérifie la règle d'accès aux médias contre la vraie base.
- **Deux gardes exécutables.** `bun run i18n:check` vérifie la parité des clés
  entre locales, `bun run a11y:check` vérifie qu'aucune cible interactive ne
  passe sous le seuil tactile à 375 px.

### Fixed

- **Les médias étaient lisibles par n'importe qui.** `/api/media/[id]` n'avait
  aucune authentification et diffusait photos, bandes démo et self-tapes — ceux
  de mineurs compris — à qui connaissait un identifiant. L'accès est désormais
  réservé au talent propriétaire, aux organisations qui l'ont mis en shortlist,
  et à l'administration.
- **Relancer un matching détruisait le travail du directeur de casting.**
  Statuts de shortlist, historique et dates de candidature étaient effacés puis
  recréés. Les décisions humaines survivent maintenant à une relance.
- **Les huit pages de types de casting servaient du français en anglais.**
  Le contenu était codé dans un fichier de données ; il vit désormais dans les
  fichiers de traduction, et les cachets sont formatés selon la locale.
- **Le domaine était faux partout.** Le sitemap, `robots.txt` et les métadonnées
  pointaient vers un domaine de parking tiers.
- **Le menu mobile s'annonçait en français** aux lecteurs d'écran anglophones et
  hispanophones.
- **Le bouton d'appel à l'action échouait au contraste WCAG AA** (3,94:1 pour un
  seuil de 4,5). Corrigé, ainsi que le texte secondaire et les bordures de champ.
- **Cibles tactiles.** Le menu mobile, les liens de pied de page et le sélecteur
  de langue passaient sous le seuil d'accessibilité sur téléphone.
- **Les champs de formulaire déclenchaient un zoom sur iOS** au focus.
- **Les montants et les dates s'affichaient au format français** quelle que soit
  la langue ; la commission affichait « 7,5 % » en anglais.
- **Les messages d'erreur restaient en français** dans toutes les langues : ils
  traversaient la frontière serveur/client déjà rédigés.

### Changed

- **Le discours tarifaire décrit ce que le produit fait.** Les pages tarifs, la
  FAQ et l'écran d'abonnement annonçaient une auto-candidature par l'IA et des
  quotas quotidiens qui n'existent pas dans le code. Le taux de commission, lui,
  est réel et devient le différenciateur affiché.
- `robots.txt` n'expose plus les espaces connectés, l'administration ni la page
  de connexion.
- Le guide de style interne, jusque-là public, passe derrière l'authentification
  administrateur (`/admin/styleguide`).
- Le fichier de proxy suit la convention Next 16 : `src/middleware.ts` devient
  `src/proxy.ts`. Même rôle — c'est le seul endroit où la locale d'une requête est
  résolue — mais le nom change, donc cherchez-le là.

### Notes

Le blog Sanity, prévu au plan, est différé. `TODOS.md` liste ce qui reste, avec
sa preuve et son déclencheur de reprise — dont deux points bloquants avant toute
mise en ligne : le stockage média ne survit pas à un hébergement serverless, et
les mentions légales n'existent pas.
