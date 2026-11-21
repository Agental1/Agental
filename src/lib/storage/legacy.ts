import type { Storage, StoredObject } from "./index";

/**
 * Supabase first, R2 second, for reads only. New files are written to
 * Supabase; a file that was saved on R2 before the move is still found there
 * until it is copied over. Deletes go to both so nothing is left behind.
 */
export class WithLegacyReads implements Storage {
  constructor(
    readonly primary: Storage,
    readonly legacy: Storage
  ) {}

  put(key: string, bytes: Buffer, mime: string): Promise<StoredObject> {
    return this.primary.put(key, bytes, mime);
  }

  async get(key: string) {
    return (await this.primary.get(key)) ?? (await this.legacy.get(key).catch(() => null));
  }

  async delete(key: string): Promise<void> {
    await Promise.all([this.primary.delete(key), this.legacy.delete(key).catch(() => undefined)]);
  }

  async signedUrl(key: string, opts?: { mime?: string | null; expiresInSeconds?: number }): Promise<string> {
    if (await this.primary.head(key)) return this.primary.signedUrl!(key, opts);
    return this.legacy.signedUrl!(key, opts);
  }

  async head(key: string) {
    return (await this.primary.head(key)) ?? (await this.legacy.head(key).catch(() => null));
  }

  async list(prefix: string): Promise<string[]> {
    const [a, b] = await Promise.all([this.primary.list(prefix), this.legacy.list(prefix).catch(() => [])]);
    return [...new Set([...a, ...b])];
  }

  presignUpload(key: string, mime: string, sizeBytes: number) {
    return this.primary.presignUpload!(key, mime, sizeBytes);
  }
}
