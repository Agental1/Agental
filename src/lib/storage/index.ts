/**
 * Swappable object storage. Local-disk in dev; swap to Cloudflare R2
 * (S3-compatible, presigned direct uploads) in prod behind the same interface.
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
}

let cached: Storage | null = null;

export async function getStorage(): Promise<Storage> {
  if (cached) return cached;
  // Only a local impl exists today; select R2 by env when implemented.
  const { LocalStorage } = await import("./local");
  cached = new LocalStorage();
  return cached;
}

/** Public URL to serve a media row (via our route handler). */
export function mediaUrl(mediaId: string): string {
  return `/api/media/${mediaId}`;
}
