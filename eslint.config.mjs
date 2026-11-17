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
    "backend/**",
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
      // revalidatePath matches the route FILE structure, not the URL. Every
      // route in this app lives under [locale], and most under a (space) or
      // (site) group, so a path like "/talents/app/profil" matches no file and
      // the call does nothing. It fails silently — no warning, no error, just
      // stale data — which is how 18 of them survived until someone measured.
      //
      // A dynamic segment also makes the second argument mandatory, and
      // "/[locale]/..." always contains one.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name='revalidatePath'] > Literal[value=/^\\/(?!\\[locale\\])/]",
          message:
            "revalidatePath takes a route file path: start it with /[locale]/ and include any (group) segments, e.g. \"/[locale]/talents/(space)/app/profil\". A URL path matches nothing and silently does nothing.",
        },
        {
          selector:
            "CallExpression[callee.name='revalidatePath'][arguments.length=1]",
          message:
            "revalidatePath needs its second argument (\"page\" or \"layout\") — every route here is under the dynamic [locale] segment, which makes it required.",
        },
      ],
    },
  },
]);

export default eslintConfig;
