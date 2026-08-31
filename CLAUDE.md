@AGENTS.md

Lisez aussi `README.md` avant de toucher au routage, à l'i18n ou aux server actions : il
porte les règles que ce dépôt fait respecter (préfixe de locale systématique, négociation
dans `src/proxy.ts` et non `src/middleware.ts`, imports de navigation via `@/i18n/navigation`,
server actions qui renvoient une clé de traduction et non une phrase).
