/**
 * Swappable object storage. Local disk in dev; in production Supabase Storage
 * when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, else Cloudflare R2,
 * selected by environment rather than by a build flag so a preview deployment
 * can point at the same bucket without a code change.
 */
export interface StoredObject {
  key: string;
  size: number;
  mime: string;
}

/** A resumable (TUS) upload the browser runs against storage directly. */
export interface TusUpload {
  endpoint: string;
  /** Signed upload token, sent as x-signature. Valid for one object. */
  token: string;
  bucket: string;
  objectName: string;
  contentType: string;
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
  signedUrl?(
    key: string,
    opts?: {
      mime?: string | null;
      /** Shorter than the default lifetime. Never longer: it is capped. */
      expiresInSeconds?: number;
    }
  ): Promise<string>;
  /** Size and type of a stored object, or null when it does not exist. */
  head(key: string): Promise<{ size: number; mime: string } | null>;
  /** Every key under a prefix. Used to remove a talent's files with their account. */
  list(prefix: string): Promise<string[]>;
  /**
   * Optional: an address the browser can PUT one file to, directly.
   *
   * A file never travels through a server action: Next caps an action's body
   * at 1 MB by default and Vercel caps a request at 4.5 MB, so anything larger
   * than a small photo has to go straight to storage. The size is part of the
   * signature; the type is checked again once the object has arrived (see
   * completeUpload). Local disk has no such address, so development uploads
   * go through /api/uploads/[id] instead.
   */
  presignUpload?(
    key: string,
    mime: string,
    sizeBytes: number
  ): Promise<{ url: string; headers: Record<string, string>; tus?: TusUpload }>;
}

/** The four variables an R2 bucket needs. All or nothing. */
const R2_VARS = [
  "R2_ACCOUNT_ID",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
] as const;

const SUPABASE_VARS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

export type StorageChoice =
  | { kind: "supabase"; config: { url: string; serviceRoleKey: string } }
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
  const sb = SUPABASE_VARS.filter((name) => (env[name] ?? "").trim() !== "");
  if (sb.length === SUPABASE_VARS.length) {
    return {
      kind: "supabase",
      config: { url: env.SUPABASE_URL!.trim(), serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!.trim() },
    };
  }
  // SUPABASE_URL alone is not a mistake: it is public and set ahead of the key.
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

  if (choice.kind === "supabase") {
    const { SupabaseStorage } = await import("./supabase");
    const primary = new SupabaseStorage(choice.config);
    // Files saved on R2 before the move stay readable until they are copied
    // (GET /api/admin/storage/copy): reads fall back to R2, writes go to Supabase.
    const legacy = selectStorage({ ...process.env, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" }, false);
    if (legacy.kind === "r2") {
      const { R2Storage } = await import("./r2");
      const { WithLegacyReads } = await import("./legacy");
      cached = new WithLegacyReads(primary, new R2Storage({
        accountId: legacy.config.R2_ACCOUNT_ID,
        bucket: legacy.config.R2_BUCKET,
        accessKeyId: legacy.config.R2_ACCESS_KEY_ID,
        secretAccessKey: legacy.config.R2_SECRET_ACCESS_KEY,
      }));
    } else cached = primary;
    return cached;
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

