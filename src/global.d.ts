import type { routing } from "@/i18n/routing";
import type common from "../messages/fr/common.json";
import type talents from "../messages/fr/talents.json";
import type casting from "../messages/fr/casting.json";

/**
 * Type-level contract for translations. French is the reference locale: its
 * message files define the key space, so a typo in `t("...")` or a key missing
 * from a namespace fails `bun run typecheck` instead of rendering the raw key
 * path to a visitor.
 *
 * This matters more the bigger the message files get: the project is going from
 * 215 keys to roughly 900 across three locales, and untyped dynamic keys like
 * t(`castingTypes.${slug}.name`) compile fine and blow up at runtime.
 *
 * `AppConfig` is declared in use-intl (next-intl re-exports it), so the
 * augmentation has to target that module.
 */
declare module "use-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: {
      common: typeof common;
      talents: typeof talents;
      casting: typeof casting;
    };
  }
}
