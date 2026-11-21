import type { Storage, StoredObject, TusUpload } from "./index";
import { VIDEO_MAX_MB } from "@/domain/uploads";

/**
 * Supabase Storage, private buckets, through its REST API with the
 * service-role key (server only, never sent to a browser).
 *
 * One app key maps to one bucket and one object path:
 *   {userId}/selftape/...  -> bucket "selftapes"
 *   {userId}/avatar/...    -> bucket "avatars"
 *   anything else          -> bucket "media"
 * The object path is the full key, so every file sits under {userId}/.
 *
 * The buckets are private and have no policy for anon or authenticated
 * requests: only this server (service role) reads and writes, and browsers
 * get short-lived signed URLs. Uploads are signed tokens for the TUS
 * (resumable) endpoint, valid for one object.
 */

export interface SupabaseConfig {
  url: string; // https://<ref>.supabase.co
  serviceRoleKey: string;
}

const VIDEO_BYTES = VIDEO_MAX_MB * 1024 * 1024;
export const BUCKETS = {
  selftapes: { fileSizeLimit: VIDEO_BYTES },
  avatars: { fileSizeLimit: 2 * 1024 * 1024 },
  media: { fileSizeLimit: VIDEO_BYTES },
} as const;
export type BucketName = keyof typeof BUCKETS;

export function bucketFor(key: string): BucketName {
  const second = key.split("/")[1];
  if (second === "selftape" || key.startsWith("selftape/")) return "selftapes";
  if (second === "avatar") return "avatars";
  return "media";
}

/** One hour, as with R2: a video player keeps working through a long tape. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Path segments are encoded one by one; the slashes stay. */
function enc(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export class SupabaseStorage implements Storage {
  private readonly base: string;
  private readonly key: string;
  private ensured: Promise<void> | null = null;

  constructor(config: SupabaseConfig) {
    this.base = config.url.replace(/\/+$/, "");
    this.key = config.serviceRoleKey;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.key}`, apikey: this.key, ...extra };
  }

  private api(path: string): string {
    return `${this.base}/storage/v1${path}`;
  }

  /** Create the private buckets once per process if they are missing. */
  ensureBuckets(): Promise<void> {
    this.ensured ??= (async () => {
      for (const [name, b] of Object.entries(BUCKETS)) {
        const res = await fetch(this.api("/bucket"), {
          method: "POST",
          headers: this.headers({ "Content-Type": "application/json" }),
          body: JSON.stringify({ id: name, name, public: false, file_size_limit: b.fileSizeLimit }),
        });
        // 400/409 "already exists" is the normal case after the first run.
        if (!res.ok && res.status !== 400 && res.status !== 409) {
          throw new Error(`supabase storage: bucket ${name} answered ${res.status}`);
        }
      }
    })().catch((error) => {
      this.ensured = null;
      throw error;
    });
    return this.ensured;
  }

  async put(key: string, bytes: Buffer, mime: string): Promise<StoredObject> {
    await this.ensureBuckets();
    const res = await fetch(this.api(`/object/${bucketFor(key)}/${enc(key)}`), {
      method: "POST",
      headers: this.headers({ "Content-Type": mime, "x-upsert": "true" }),
      body: new Uint8Array(bytes),
    });
    if (!res.ok) throw new Error(`supabase storage: put answered ${res.status}`);
    return { key, size: bytes.length, mime };
  }

  async get(key: string): Promise<{ bytes: Buffer; mime: string } | null> {
    const res = await fetch(this.api(`/object/authenticated/${bucketFor(key)}/${enc(key)}`), {
      headers: this.headers(),
      cache: "no-store",
    });
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`supabase storage: get answered ${res.status}`);
    return {
      bytes: Buffer.from(await res.arrayBuffer()),
      mime: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  async delete(key: string): Promise<void> {
    const res = await fetch(this.api(`/object/${bucketFor(key)}`), {
      method: "DELETE",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: [key] }),
    });
    if (!res.ok && res.status !== 404) throw new Error(`supabase storage: delete answered ${res.status}`);
  }

  async signedUrl(key: string, opts?: { mime?: string | null; expiresInSeconds?: number }): Promise<string> {
    const asked = opts?.expiresInSeconds;
    const expiresIn =
      typeof asked === "number" && Number.isFinite(asked) && asked >= 1
        ? Math.min(Math.floor(asked), SIGNED_URL_TTL_SECONDS)
        : SIGNED_URL_TTL_SECONDS;
    const res = await fetch(this.api(`/object/sign/${bucketFor(key)}/${enc(key)}`), {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ expiresIn }),
    });
    if (!res.ok) throw new Error(`supabase storage: sign answered ${res.status}`);
    const { signedURL } = (await res.json()) as { signedURL: string };
    return `${this.base}/storage/v1${signedURL}`;
  }

  async head(key: string): Promise<{ size: number; mime: string } | null> {
    const res = await fetch(this.api(`/object/authenticated/${bucketFor(key)}/${enc(key)}`), {
      method: "HEAD",
      headers: this.headers(),
      cache: "no-store",
    });
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`supabase storage: head answered ${res.status}`);
    return {
      size: Number(res.headers.get("content-length") ?? 0),
      mime: (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0],
    };
  }

  /** Every key under a prefix, across the buckets it can live in. */
  async list(prefix: string): Promise<string[]> {
    const buckets: BucketName[] = prefix.split("/").length <= 2 && !prefix.startsWith("selftape/")
      ? ["selftapes", "avatars", "media"]
      : [bucketFor(prefix + "x")];
    const out: string[] = [];
    for (const bucket of buckets) await this.walk(bucket, prefix, out);
    return out.filter((k) => k.startsWith(prefix));
  }

  private async walk(bucket: BucketName, prefix: string, out: string[]): Promise<void> {
    const dir = prefix.includes("/") ? prefix.slice(0, prefix.lastIndexOf("/")) : "";
    for (let offset = 0; ; offset += 1000) {
      const res = await fetch(this.api(`/object/list/${bucket}`), {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ prefix: dir, limit: 1000, offset }),
      });
      if (res.status === 404 || res.status === 400) return;
      if (!res.ok) throw new Error(`supabase storage: list answered ${res.status}`);
      const items = (await res.json()) as { name: string; id: string | null }[];
      for (const item of items) {
        const path = dir ? `${dir}/${item.name}` : item.name;
        if (item.id === null) {
          // A folder: walk it when it can hold keys under the prefix.
          if (`${path}/`.startsWith(prefix) || prefix.startsWith(`${path}/`)) {
            await this.walk(bucket, `${path}/`, out);
          }
        } else out.push(path);
      }
      if (items.length < 1000) return;
    }
  }

  /**
   * A signed token for one object, used by the browser on the resumable
   * (TUS) endpoint. The token alone allows that single upload; the size and
   * type are checked again in completeUpload once the object is there.
   */
  async presignUpload(
    key: string,
    mime: string
  ): Promise<{ url: string; headers: Record<string, string>; tus: TusUpload }> {
    await this.ensureBuckets();
    const bucket = bucketFor(key);
    const res = await fetch(this.api(`/object/upload/sign/${bucket}/${enc(key)}`), {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: "{}",
    });
    if (!res.ok) throw new Error(`supabase storage: upload sign answered ${res.status}`);
    const { url, token: maybe } = (await res.json()) as { url: string; token?: string };
    const token = maybe ?? new URL(url, this.base).searchParams.get("token") ?? "";
    // The direct storage host is recommended for large uploads.
    const host = new URL(this.base).host.replace(/\.supabase\.co$/, ".storage.supabase.co");
    return {
      url: `${this.base}/storage/v1${url}`,
      headers: { "Content-Type": mime },
      tus: {
        endpoint: `https://${host}/storage/v1/upload/resumable/sign`,
        token,
        bucket,
        objectName: key,
        contentType: mime,
      },
    };
  }
}
