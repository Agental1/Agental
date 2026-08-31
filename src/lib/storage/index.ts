/**
 * Swappable object storage. Local disk in dev, Cloudflare R2 in production,
 * selected by environment rather than by a build flag so a preview deployment
 * can point at the same bucket without a code change.
 */
export interface StoredObject {
  key: string;
  size: number;
  mime: string;
}

export interface Storage {
  put(key: string, bytes: Buffer, mime: string): Promise<StoredObject>;
  get(key: string): Promise<{ bytes: Buffer; mime: string } | null>;
  delete(key: string): Promise<void>;
  /**
   * Optional: a short-lived URL the browser can fetch directly.
   *
   * Backends that can hand the bytes to the client themselves implement this,
   * and the media route redirects to it instead of proxying. Local disk cannot,
   * so it is absent there and the route falls back to streaming through us.
   */
  signedUrl?(key: string): Promise<string>;
}

/** The four variables an R2 bucket needs. All or nothing. */
const R2_VARS = [
  "R2_ACCOUNT_ID",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
] as const;

export type StorageChoice =
  | { kind: "r2"; config: Record<(typeof R2_VARS)[number], string> }
  | { kind: "local" }
  | { kind: "error"; missing: string[] };

/**
 * Decides which backend to use from the environment. Pure, so the rule can be
 * tested without touching a disk or a bucket.
 *
 * Partial configuration is an error, never a silent downgrade: a deployment
 * with three of the four variables set is a typo, and falling back to local
 * disk there would "work" right up until the first upload vanished. Production
 * with no configuration at all is the same mistake, one step earlier.
 */
export function selectStorage(
  env: Readonly<Record<string, string | undefined>>,
  isProduction: boolean
): StorageChoice {
  const present = R2_VARS.filter((name) => (env[name] ?? "").trim() !== "");

  if (present.length === R2_VARS.length) {
    const config = Object.fromEntries(
      R2_VARS.map((name) => [name, env[name]!.trim()])
    ) as Record<(typeof R2_VARS)[number], string>;
    return { kind: "r2", config };
  }
  if (present.length > 0) {
    return { kind: "error", missing: R2_VARS.filter((n) => !present.includes(n)) };
  }
  if (isProduction) return { kind: "error", missing: [...R2_VARS] };
  return { kind: "local" };
}

let cached: Storage | null = null;

export async function getStorage(): Promise<Storage> {
  if (cached) return cached;

  const choice = selectStorage(
    process.env,
    process.env.NODE_ENV === "production"
  );

  if (choice.kind === "error") {
    throw new Error(
      `Object storage is not configured: ${choice.missing.join(", ")} ` +
        "missing. Uploads would be written to a filesystem that does not " +
        "survive a redeploy. See .env.example for where these come from " +
        "(Cloudflare dashboard → R2 → Manage API tokens)."
    );
  }

  if (choice.kind === "r2") {
    const { R2Storage } = await import("./r2");
    cached = new R2Storage({
      accountId: choice.config.R2_ACCOUNT_ID,
      bucket: choice.config.R2_BUCKET,
      accessKeyId: choice.config.R2_ACCESS_KEY_ID,
      secretAccessKey: choice.config.R2_SECRET_ACCESS_KEY,
    });
    return cached;
  }

  const { LocalStorage } = await import("./local");
  cached = new LocalStorage();
  return cached;
}

/** Public URL to serve a media row (via our route handler). */
export function mediaUrl(mediaId: string): string {
  return `/api/media/${mediaId}`;
}
