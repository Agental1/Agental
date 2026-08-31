import { defineConfig } from "vitest/config";

/**
 * Unit tests for the logic the type checker cannot vouch for.
 *
 * Scope is deliberate: pure domain, lib and data functions, plus the access
 * rule of the media route with Prisma stubbed. React components and pages are
 * covered by the browser-level guards instead (`bun run a11y:check`, `bun run
 * i18n:check`), which catch what unit tests structurally cannot — rendered
 * sizes, contrast, and language leaks.
 *
 * `.mts` rather than `.ts`: the config is ESM, and as `.ts` it is loaded as
 * CommonJS and warns on every run.
 */
export default defineConfig({
  resolve: {
    // Native since Vite 7 — no vite-tsconfig-paths plugin needed for `@/`.
    tsconfigPaths: true,
    alias: {
      // Zod 4's ESM entry does not re-export the `z` namespace under Vite's
      // resolution, so `import { z } from "zod"` lands as undefined and every
      // app module that builds a schema at import time dies with
      // "undefined is not an object (evaluating 'z.enum')". The CJS entry does
      // export `z`, and it is the same code the app ends up running — verified
      // by comparing both entries.
      zod: new URL("./node_modules/zod/index.cjs", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/lib/**", "src/data/**", "src/i18n/**"],
      reporter: ["text-summary"],
    },
  },
});
