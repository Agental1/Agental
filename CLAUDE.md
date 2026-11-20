@AGENTS.md

Lisez aussi `README.md` avant de toucher au routage, à l'i18n ou aux server actions : il
porte les règles que ce dépôt fait respecter (préfixe de locale systématique, négociation
dans `src/proxy.ts` et non `src/middleware.ts`, imports de navigation via `@/i18n/navigation`,
server actions qui renvoient une clé de traduction et non une phrase).

## gstack (recommended)

This project uses [gstack](https://github.com/garrytan/gstack) for AI-assisted workflows.
Install it for the best experience:

```bash
git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup --team
```

Skills like /qa, /ship, /review and /browse become available after install.
Use /browse for all web browsing (Aside first, the bundled gstack browser as fallback). Use ~/.claude/skills/gstack/... for gstack file paths.
