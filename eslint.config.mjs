import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // `redirect` from next/navigation drops the active locale. Under
    // localePrefix "always" that silently drops an English or Spanish user into
    // /fr/** at login, signup and onboarding — the exact bug this project is
    // fixing. @/i18n/navigation's redirect({href, locale}) is locale-aware.
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/navigation",
              importNames: ["redirect", "permanentRedirect", "usePathname", "useRouter"],
              message:
                "Use @/i18n/navigation instead — next/navigation is not locale-aware.",
            },
            {
              name: "next/link",
              message: "Use the Link from @/i18n/navigation instead.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
