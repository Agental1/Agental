# Changelog

Toutes les évolutions notables de ce projet. Format inspiré de
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [0.5.5.2] - 2026-11-22

### Changed (round 7b, group 2)

- **Profile > Media in four categories**: photos of yourself, past productions, general videos, other. Each item has a short description and can move to another category. Existing media moved to the closest category (photos to "Photos of yourself", videos to "General videos", the rest to "Other"). Each category counts in profile completeness.
- **Every uploaded item shows a preview**: the photo itself, a frame of the video with a play button (opens a player), an audio player for voice. iPhone photos (HEIC) are turned into JPEG in the browser before upload, since only Safari can display HEIC; a file the browser still cannot draw says so instead of showing an empty tile.
- **"Create your website" stays in the app**: the dashboard card opens Website in the app, which now has the Limelight request form when there is no site yet. It used to open the public Limelight page, whose header always shows "Sign in", which looked like being signed out.

Migration `20261130000000_media_categories` (two additive columns on Media, backfilled).

## [0.5.5.1] - 2026-11-22

### Changed (round 7b, group 1)

- **One "Complete your profile" block on the dashboard**: the percentage, the next missing item and a Resume button that opens the exact tab and field (for example Profile > Identity with the date of birth focused).
- **AI suggestions follow the profile's real data**: one list of missing items behind the dashboard, the suggestions, the assistant and the admin, so nothing already filled is asked for. A saved height is no longer asked for again, and one link (IMDb or portfolio) is enough for 100%. The admin shows the computed percentage instead of the stored one.
- **Avatar menu** at the top right with Profile, Settings and Sign out; the other sign-out buttons are gone.
- **Settings rebuilt** in five sections: Account (name, email, password, connected Google account), Language (saved on the account), Notifications (three email switches), Privacy and cookies, Subscription.
- **Cookie banner** for every visitor: it disappears as soon as a choice is made and stays gone; the choice is stored with its date and notice version, in the browser and on the account. Changeable in Settings > Privacy and cookies.
- **Reel & Self-tape** explains what a self-tape is for and where it goes, and a take can be downloaded before saving.

Migration `20261129000000_settings_consent` (four additive columns on User).

## [0.5.5.0] - 2026-11-21

### Added (round 7, branch `round7`)

- **Admin portal for accounts and AI work.** Each account has a status (Unreviewed, Approved, Test, Staff, Spam) that staff can change one by one or in bulk, with signup totals, filters and CSV. Admin also lists the conversations waiting for the Agental team (oldest first), applications and AI jobs with their states, and revenue as "Unavailable" until payments exist. Every change is in the audit log.
- **The AI agents start only for eligible accounts.** A search needs a verified email, an adult performer and the right status: Test while the app is in test mode (the default), Approved once the founders switch it to live. The server checks this at the click and again when n8n picks up the search.
- **Connection points for the n8n workflows "Beta V2" and "Beta V2 - Direct Replies".** Five routes for casting searches and email replies, closed (404) until the shared secret is set. Results arrive as drafts the performer sees under Applications, "Roles found for you", with the casting site link. Nothing is sent or submitted.
- **Limelight requests record where they came from** (the Limelight page or the app's site panel), and the confirmation scrolls into view after sending.

### Changed

- **Admin is limited to contact@agental.co in production.** An account with the admin flag and any other email is refused on every admin page and action.

## [0.5.4.0] - 2026-11-20

### Changed (round 6 part 2, branch `round6-part2-v2`)

- **Saving now confirms itself with a short message at the bottom of the screen.** Profile saves, uploads and sent messages show "Saved", "Uploaded" or "Sent" for a few seconds. Errors still appear next to the field or button that failed, so they stay on screen until you fix them.
- **Buttons show a spinner while they work** and ignore repeat clicks, without losing keyboard focus. Icon-only buttons in the media manager show their name on hover and on keyboard focus.
- **Deleting a recording asks first** in a proper dialog, with the recording's name, instead of the browser's own pop-up.
- **The phone menu is a sliding panel** in the Talent app, the Casting app and admin, with a Close button and the same theme as the page.
- **Loading screens** show the page's outline while it loads, in all three apps, and screen readers hear "Loading" once.
- **Cleaner controls:** the availability field is a styled list, the cookie choices are switches, and the AI search allowance and self-tape upload show a progress bar. Motion stays off when your system asks for reduced motion.
- Under the hood: the interface kit is shadcn/ui, mapped onto the Agental colors in both themes, with one copy of Radix (`radix-ui`) instead of three separate packages.

## [0.5.3.0] - 2026-11-20

### Changed (round 6 closeout, branch `round6-closeout`)

- **Talent prices are back to the original grid.** Premium is $49 a month and Ultimate $79 a month, and Ultimate's commission on bookings is 5%. Basic ($0, 10%) and Pro ($19, 10%) are unchanged, as are the search allowances (5, 50, 250, 500). Every place that shows a price, a commission or a search allowance now reads it from one table, `src/domain/pricing.ts`: the pricing page, the Talent page, the plan cards, the plan switcher, Subscription and the FAQ, in English, French, Spanish and Chinese.
- **The copy can no longer drift from the prices.** Plan feature lines and the FAQ answer about commission carry placeholders filled from the pricing table, and a test fails if a figure is typed back into that copy.

### Added

- **A permanent project memory.** `docs/DECISIONS.md` records the founders' decisions (products, prices, brand, stack, rules) and lists where the code still differs from them. `CLAUDE.md` tells every future session to read it first and never to change a price, plan, commission, allowance or brand rule without the founders' instruction.

## [0.5.2.0] - 2026-11-20

### Changed (2026-11-20, round 6 part 1, branch `round6`)

- **Your cookie choice now follows your account.** Signing out and back in, or using the same browser for two accounts, no longer brings back a different choice. When the browser and the account disagree, the stricter answer wins for each category, so a refusal is never undone without you choosing again.
- **Settings › Cookie preferences shows what this browser actually applies** and says "Your choice is saved" only once the account has it. If the save fails, the browser keeps its previous choice and the error is shown.
- **Keyboard users keep their place** after pressing a cookie button in Settings; focus no longer jumps to the top of the page while the choice saves.
- **Safer move of stored files from R2 to Supabase** (admin route `/api/admin/storage/copy`). The dry run reports sizes, what Supabase already holds, whether the copy fits the Free plan, and every file the database points to, profile pictures included. The copy moves only files an account still uses, passes over broken, oversized or vanished files, and logs failures without file names.

### Changed (2026-11-18, front-end redesign, branch `frontend-redesign`)

- **Two mirrored themes, one accent.** Talent and Limelight run from white to pale blue (`#FFFFFF` to `#DCEAFF`) with near-black text; Casting runs from near-black to deep blue (`#080B12` to `#102B63`) with white text. Both share the accent `#246BFE`. The Green room and Spotlight palettes, the four web fonts and the scroll-tied animations are gone; type is Helvetica Bold and Regular from the system. Tokens and contrast figures: `src/app/globals.css`.
- **The A monogram** replaces the "T" tape mark and the four-point star everywhere, app icons included. Files and usage: `brand/README.md`.
- **Public site.** The entry screen is two tiles ("I'm a performer", "I cast roles") that lead to account creation. Both landings are down to a hero, the steps to join, and compact plan cards; Limelight shows a sample site first, then the offers and the form. No photos of people and no testimonials. Plan prices are read from `src/domain/pricing.ts` and shown in US dollars.
- **Signed-in apps.** New shell (`src/components/app/app-shell.tsx`): sidebar flush with the left edge from 768px, sticky top bar and menu sheet below, in the Talent app, the Casting app and admin. The plan badge at the top right opens a plan switcher. Text that was hard-coded in French now comes from the message files in all four locales.
- **Career page.** Shows Roles booked, Gross fee and Net received; the commission figure and column are removed.

Details by task, decisions and open items: `docs/FRONTEND_AUDIT.md` and `docs/FRONTEND_BACKEND_HANDOFF.md`.


### Changed

- **Portail Talents : système « Green room » (2026-11).** Le portail Talents passe
  au sable `#ece3d3` et au blanc, avec un seul accent vert `#1f5c47` réservé aux
  actions. Titres en Big Shoulders Display (police condensée d'affiche),
  texte en Instrument Sans, toutes deux auto-hébergées depuis `src/assets/fonts`
  (licence OFL, aucun appel à Google). Boutons rectangulaires (6 px) et en-tête
  à angles de 12 px sur Talents ; le repère de ruban en T remplace l'étoile à
  quatre branches côté Talents. Le portail Casting est inchangé : les nouvelles
  valeurs vivent dans un bloc `[data-portal="talents"]` dédié (comparaison
  visuelle avant/après de la landing Casting identique).
- **Mouvement au défilement sur les pages Talents.** Une bande de ruban se pose
  sous chaque titre de section, les portraits se révèlent comme au labo, et le
  panneau de scène dérive au défilement. Animations CSS pilotées par le scroll,
  repli par `IntersectionObserver` (`src/components/talents/scroll-motion.tsx`)
  pour les navigateurs sans support, états finaux sous `prefers-reduced-motion`.
- **Sélecteur Talents | Casting dans l'en-tête, des deux côtés, à toutes les
  largeurs.** Il remplace le lien « Are you a casting director? », qui ne
  s'affichait qu'à partir de 1536 px de large : sur un portable ou un téléphone,
  on ne trouvait pas l'autre portail.
- **Lien « Limelight by Agental » dans le pied de page**, des deux côtés, à
  côté d'Agental Talents et d'Agental Casting. Suite côté backend :
  `docs/BACKEND_NEXT_STEPS.md`.
- **Landing Talents allégée.** « Devenir membre » et « Voir comment ça marche »
  sont dans le panneau de scène, dès le premier écran ; le grand wordmark
  au-dessus du panneau et la bande de neuf portraits sont retirés (les types de
  casting restent, en liens). Les cinq étapes deviennent un parcours cliquable
  (`src/components/talents/join-steps.tsx`) : boutons radio natifs et `:has()`,
  donc clavier, sans JavaScript, et une illustration par étape.
- **Page « Qui sommes-nous » : section équipe retirée** (« Ce qui nous
  rassemble » et les trois prénoms), dans les quatre langues.

### Added

- **Limelight by Agental, `/[locale]/talents/limelight`.** Page de l'offre de
  sites web pour les artistes : maquette de site qui se construit au défilement,
  trois étapes, planche-contact de six modèles qui défile à l'horizontale en
  section épinglée, deux offres (Essentiel 99 $, Signature 199 $, hébergement
  renouvelé à 49 $ ou 79 $ par an après la première année), FAQ et formulaire
  « Lance ton site ». Le nom, le slug et les prix vivent dans
  `src/domain/limelight.ts`. Le formulaire passe par la server action
  `src/app/actions/limelight.ts`, qui transmet au workflow n8n signé en
  HMAC-SHA256 quand `LIMELIGHT_LEADS_WEBHOOK_URL` et `N8N_SIGNING_SECRET` sont
  posés, et ne fait que journaliser sinon. Champ piège anti-robots, limite de
  cinq envois par visiteur et par dix minutes, longueurs plafonnées. Paiement en ligne non branché :
  à ouvrir après l'avis de l'avocat. Lien « Sites web » dans la navigation
  Talents et bandeau d'appel sur la landing.

- **Refonte v1 (« Spotlight »), d'après les quatre planches de référence de
  l'équipe design.** Nouvelle couche de tokens dans `globals.css` : fond papier
  neutre, encre franche et une seule couleur signal (le gaffer de plateau),
  réservée aux marques ; Talents reste clair, Casting devient la scène sombre.
  Geist Sans / Geist Mono remplacent Instrument Sans / JetBrains Mono, servies
  par le paquet `geist` (aucun appel à Google Fonts au build). Boutons pilule,
  en-tête flottant en pilule avec un lien « Se connecter », pied de page avec
  le wordmark bord à bord. Les deux landings sont reconstruites : wordmark
  scindé au-dessus d'un panneau de scène (une poursuite sur un comédien côté
  Talents, la démo de short-list en direct côté Casting), planche-contact des
  types de casting, cartes encadrées en filets, étapes numérotées, tableau des
  commissions. Les blocs partagés vivent dans
  `src/components/marketing/blocks.tsx`. Les autres pages héritent des tokens
  sans modification de code.
- **`/<locale>` devient une entrée à deux portes** (Talents / Casting) au lieu
  de rediriger vers Talents (proposition pour la décision D18).
- **Quatre locales : anglais (défaut), français, espagnol, chinois.** Chaque
  locale garde son préfixe (`/en`, `/fr`, `/es`, `/zh`) ; une URL sans préfixe
  est négociée vers la langue du visiteur, l'anglais à défaut. Les types de
  messages dérivent de `messages/en`. Le chinois est nouveau : toutes les clés
  sont traduites (Talents dit « 你 », Casting « 您 »), `<html lang>` et
  hreflang portent `zh-Hans`, et `globals.css` contient des règles de
  composition chinoise (pas d'interlettrage négatif, interlignage ouvert,
  titres coupés à la ponctuation). `/zh` reprend les portraits US en attendant
  un jeu dédié.
- **Le sélecteur de langue devient un menu globe dans l'en-tête**, et une
  liste complète des noms natifs dans le menu mobile, les écrans de connexion
  et la barre latérale de l'application.

### Added

- **Un mode démo pour enregistrer une vidéo du produit : `?demo`.** Ouvrez
  `/en/talents?demo`, lancez l'enregistrement d'écran, cliquez une fois : une
  visite scriptée d'environ 35 secondes enchaîne la landing Talents (les cinq
  étapes, le studio self-tape) puis la landing Casting, où le brief de la carte
  de démo est retapé, la short-list générée et la source de chaque profil
  mise en avant, avant un écran de fin. Légendes en bas d'écran, cartes de
  chapitre plein écran, curseur masqué. `R` relance la prise, `Échap` quitte
  le mode. Tout ce que la caméra filme entre les cartes est l'interface réelle :
  le lecteur ne fait que défiler, cerner, taper et cliquer sur les éléments
  marqués `data-demo="…"`. Les noms et scores de la carte de démo portent la
  mention « Demo data » à l'écran et sur l'écran de fin. Sans le paramètre,
  rien ne change pour les visiteurs : le lecteur est un chunk chargé à la
  demande. La visite est en anglais et force `/en`.

## [0.5.1.0] - 2026-09-07

### Changed

- **La carte de démo du portail casting adopte le langage visuel des maquettes.**
  C'est le premier écran que voit un directeur de casting, et c'était le dernier
  bloc resté à l'ancien style après la refonte : la sélection s'affiche
  maintenant avec un bandeau de résultat, un score en gros chiffres et une barre
  qui en donne la mesure d'un coup d'œil.

### Fixed

- **Le compteur de profils s'affiche au format de la langue lue.** « 1 240 » en
  français, « 1,240 » en anglais, « 1240 » en espagnol. La valeur était écrite en
  dur au format français, donc les visiteurs anglophones et hispanophones
  voyaient une espace de groupement qui n'existe pas chez eux.

- **Le badge « dispo » était en français sur les trois versions du site.** Il
  affiche désormais « available » sur `/en` et « disponible » sur `/es`.

## [0.5.0.0] - 2026-09-06

Refonte du site public d'après les maquettes New LP, dans les trois langues.

### Added

- **Des visages sur le site.** Le collage du hero Talents affichait quatre cases
  vides avec une légende ; il montre maintenant quatre portraits, différents
  selon la langue : un visiteur sur `/fr` ne voit pas les mêmes personnes que
  sur `/en` ou `/es`. Les cartes du hub `/castings` et le chapô de chaque
  landing SEO sont illustrés par tranche d'âge.

- **Une neuvième landing de casting : « Performeurs & scène ».** Danse, musique,
  magie, cirque, animation, cascade. Elle apporte aussi la spécialité
  correspondante à l'inscription : un performeur arrivé par Google peut
  désormais s'inscrire dans sa discipline.

- **Une FAQ sur chaque landing SEO**, avec ses données structurées, là où ces
  pages étaient entièrement en texte suivi.

- **Une section « Des candidatures qui décrochent des réponses »** sur la landing
  Talents, avec sa réserve de méthode affichée.

### Changed

- **Toute la typographie du site public.** Instrument Sans remplace Inter et
  Fraunces ; les intitulés de section, les numéros d'étape et les montants
  passent en JetBrains Mono. Les titres gagnent en poids et se resserrent.

- **Les textes des deux portails sont nettement plus précis** : cachets
  indicatifs, méthode, protections légales des mineurs. Écrits en français puis
  traduits en anglais et en espagnol.

- **La page « Qui sommes-nous »** raconte l'origine du projet et présente trois
  personnes au lieu de deux.

- **Le sélecteur de langue** affiche `FR · EN · ES` au lieu des noms complets sur
  écran large : le header tenait sur deux lignes et se réempilait.

### Fixed

- **La bande finale de la landing Talents était invisible.** Elle était écrite
  avec des classes de couleur qui ne rendent rien : la feuille de styles
  n'expose que des rôles, et `bg-espresso` n'en est pas un. Vingt-quatre classes
  de ce type existaient dans le dépôt, dont l'overlay des fenêtres modales, qui
  n'assombrissait donc rien, et la pastille d'enregistrement du studio
  self-tape, qui n'avait aucun remplissage.

- **Le bouton principal du portail Casting devenait illisible au survol.** Le
  texte blanc tombait à 3,36:1 sur la couleur de survol, sous le plancher
  d'accessibilité, parce que celle-ci était plus claire que la couleur de repos.

- **Les coches des formules tarifaires étaient presque invisibles** sur la carte
  mise en avant du portail Casting : 1,71:1, alors qu'elles sont la seule chose
  qui indique ce qu'une formule inclut.

- **Les coches de validation des short-lists** échouaient déjà l'accessibilité
  avant cette version (4,48:1) ; le vert retenu monte à 7,86:1.

- **Les pages FAQ n'avaient plus qu'un seul titre**, ce qui supprimait la
  navigation par titres au lecteur d'écran sur les deux pages les plus longues
  du site.

- **Le site débordait de 58 pixels sur mobile** sur la landing Talents.

- **Les liens de langue mesuraient 23,92 pixels de large**, sous le plancher de
  24 imposé aux cibles tactiles.

- **La carte de partage sur les réseaux était fabriquée à chaque partage** au
  lieu d'être générée une fois : les robots abandonnaient avant la fin.

## [0.4.1.1] - 2026-08-31

### Fixed

- **Les titres d'onglet des pages privées étaient français dans les trois
  langues.** Quinze pages — les deux espaces, l'administration — exportaient un
  `metadata` statique, forme qui ne peut pas être localisée. Elles passent en
  `generateMetadata`, la seule forme que la documentation de Next 16 décrit.
  Presque toutes les clés existaient déjà.

  Le guide de style reste statique : c'est une page de développement derrière la
  garde admin, laissée hors périmètre de traduction par le plan. La raison est
  désormais écrite dans le fichier.

## [0.4.1.0] - 2026-08-31

### Fixed

Cinq écrans restaient français dans les trois langues. Les chaînes vivaient
dans des constantes de module, hors de portée de la garde lexicale.

- **L'assistant de brief** — les sept questions, leurs exemples et les options
  de genre. C'est le parcours par lequel un directeur de casting crée un projet.
- **Le tableau de bord talent** — quatre indicateurs, trois suggestions et le
  message d'accueil.
- **Les deux écrans d'abonnement** — les descriptions de formules, « Sur devis »
  et les unités de prix.
- **La démo interactive** de la page casting — les justifications de la
  short-list et l'unité de tarif journalier.
- **« Types de casting »** dans la navigation des landings, à côté de trois
  appels `t()`. Signalé par la revue de design initiale comme corrigé ; il ne
  l'avait jamais été.

### Changed

- **L'écran d'abonnement talent vendait encore des promesses retirées.** Il
  affichait « Auto-candidature IA », « 10 candidatures/j », « 50
  candidatures/j », « Illimité » — exactement ce que la passe sur le discours
  tarifaire avait supprimé des fichiers de messages en v0.2.0.0. La version
  corrigée existait, traduite dans les trois langues, et n'avait jamais été
  branchée. Elle l'est.

  Même schéma pour le tableau de bord talent, dont les sept libellés traduits
  attendaient un appelant.

## [0.4.0.1] - 2026-08-31

### Fixed

- **L'en-tête d'un projet de casting restait français** dans les trois langues :
  « Rôle « Maxime » · 25–32 ans · accent breton · 4 profils retenus ». Il était
  assemblé par concaténation, ce qui ne peut pas marcher : les guillemets
  changent de forme selon la langue (« » / “ ” ), « 25–32 ans » se dit « ages
  25–32 », et le nombre de profils demande une règle de pluriel.
- **La liste de candidatures d'un talent était française de bout en bout** alors
  que le fichier appelait déjà `useTranslations` : les cinq onglets de filtre,
  les huit libellés de statut et le badge « Auto IA / Manuelle ». Statuts et
  onglets vivaient dans des constantes de module, hors de toute portée que la
  garde lexicale inspecte.

  Les libellés de statut sont écrits du point de vue du talent — « Envoyée »,
  « Invitée en audition », « Sans suite » — là où `app.candidatureStatus`, qui
  n'a aucun utilisateur, les nomme côté casting. Cette perspective est du choix
  éditorial : elle est traduite, pas écrasée.

## [0.4.0.0] - 2026-08-31

### Changed

- **L'explication d'une shortlist n'est plus une phrase, mais des raisons
  structurées.** Elle était construite en français sur le serveur et persistée,
  alors que trois personnes la lisent — le directeur de casting qui a lancé le
  brief, un collègue de son organisation, et le talent lui-même via sa liste de
  candidatures. Elle était française pour toutes, dans les trois langues.

  `MatchScore.justification` devient `MatchScore.reasons`, du JSON, comme
  `factors` et `diversityFlags` l'étaient déjà. **Migration destructive** : la
  colonne portait du texte généré, réécrit à chaque relance de matching.
- **Le scorer LLM choisit désormais dans une liste fermée** au lieu de rédiger.
  C'est un vrai renoncement — la prose est ce qu'un modèle fait de mieux — mais
  une explication persistée et relue par plusieurs personnes ne peut pas vivre
  dans une seule langue.

### Fixed

- « Mineur » et « profil similaire » étaient codés en dur sur les cartes de
  shortlist. La garde lexicale ne pouvait pas les voir : aucun mot-marqueur
  français n'y figure.

## [0.3.2.1] - 2026-08-31

### Fixed

- **Les conseils de self-tape s'affichaient en français dans les trois
  langues.** Un talent enregistre sa prise et lit « Rapproche-toi du micro et
  coupe les bruits de fond » quelle que soit sa langue — le texte le plus lu de
  l'écran, puisqu'il apparaît après chaque prise. Le scorer construisait des
  phrases sur le serveur ; il renvoie maintenant des clés, rendues côté client
  dans la langue du visiteur. Le type `TipKey` est dérivé du fichier de messages
  comme `ErrorKey`, donc une clé inexistante échoue au typecheck.
- **La ligne « Cadrage · Lumière · Son »** au-dessus des conseils était codée en
  dur alors que les trois clés existaient déjà.
- **Le paramètre du `.map()` s'appelait `t`**, masquant la fonction de
  traduction : rien n'aurait pu être traduit à cet endroit sans le renommer.

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
