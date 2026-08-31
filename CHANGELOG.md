# Changelog

Toutes les évolutions notables de ce projet. Format inspiré de
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

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
