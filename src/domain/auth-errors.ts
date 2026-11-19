import type { ErrorKey } from "./action-result";

/**
 * Error codes /connexion accepts in `?error=`. The value comes from the URL, so
 * it is never rendered: a known code maps to its message key, anything else
 * (our typos, Auth.js codes like "AccessDenied" or "Configuration", or a
 * hand-edited link) maps to the generic provider error.
 */
const AUTH_ERROR_KEYS = {
  oauthNoAccount: "errors.oauthNoAccount",
  oauthEmailUnverified: "errors.oauthEmailUnverified",
  oauthLinkRequiresPassword: "errors.oauthLinkRequiresPassword",
  oauthGeneric: "errors.oauthGeneric",
  adultsOnly: "errors.adultsOnly",
} as const satisfies Record<string, ErrorKey>;

export type AuthErrorCode = keyof typeof AUTH_ERROR_KEYS;

export function authErrorKey(raw: string | string[] | undefined): ErrorKey | null {
  const code = Array.isArray(raw) ? raw[0] : raw;
  if (!code) return null;
  return Object.hasOwn(AUTH_ERROR_KEYS, code)
    ? AUTH_ERROR_KEYS[code as AuthErrorCode]
    : AUTH_ERROR_KEYS.oauthGeneric;
}
