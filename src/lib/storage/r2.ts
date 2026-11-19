import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Storage, StoredObject } from "./index";

/**
 * Cloudflare R2 via its S3-compatible API.
 *
 * R2 is S3 with two deviations that matter here: the region is always the
 * literal string "auto" (R2 has no regions to choose), and the endpoint is
 * per-account rather than per-region.
 */
export interface R2Config {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * How long a presigned read URL stays valid. One hour: a video player keeps
 * asking for byte ranges from the same URL while it plays, and a five-minute
 * URL stalled anything longer than that or paused for a while.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** How long a presigned upload URL stays valid. Matches UPLOAD_TTL_MS. */
const UPLOAD_URL_TTL_SECONDS = 30 * 60;

export class R2Storage implements Storage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: R2Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(key: string, bytes: Buffer, mime: string): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: mime,
      })
    );
    return { key, size: bytes.length, mime };
  }

  /**
   * Reads the whole object into memory. Kept because the interface promises it
   * and the local implementation behaves the same, but prefer `signedUrl` for
   * anything user-facing: a 50 MB self-tape buffered inside a serverless
   * function is 50 MB of function memory plus a second copy in the response.
   */
  async get(key: string): Promise<{ bytes: Buffer; mime: string } | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key })
      );
      if (!res.Body) return null;
      const bytes = Buffer.from(await res.Body.transformToByteArray());
      return { bytes, mime: res.ContentType ?? "application/octet-stream" };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    );
  }

  /**
   * Short-lived URL that streams the object straight from R2 to the browser.
   *
   * The authorisation decision still happens on our side, in the route handler,
   * before this is ever called — the URL is the delivery mechanism, not the
   * access control. The TTL is deliberately short: a leaked URL stops working
   * in minutes rather than being a permanent public link to a self-tape.
   */
  async signedUrl(key: string, opts?: { mime?: string | null }): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        // Serve the type we recorded and play in the page: the stored
        // Content-Type is whatever the browser sent at upload time.
        ...(opts?.mime ? { ResponseContentType: opts.mime } : {}),
        ResponseContentDisposition: "inline",
      }),
      { expiresIn: SIGNED_URL_TTL_SECONDS }
    );
  }

  async head(key: string): Promise<{ size: number; mime: string } | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      );
      return {
        size: res.ContentLength ?? 0,
        mime: res.ContentType ?? "application/octet-stream",
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        })
      );
      for (const item of res.Contents ?? []) if (item.Key) keys.push(item.Key);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }

  /**
   * A URL the browser PUTs the file to. Content-Length is signed, so the URL
   * accepts exactly the size that was declared and checked. The browser must
   * send the returned Content-Type header; the bucket needs a CORS rule that
   * allows PUT with that header from the site's origins.
   */
  async presignUpload(
    key: string,
    mime: string,
    sizeBytes: number
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: mime,
        ContentLength: sizeBytes,
      }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS }
    );
    return { url, headers: { "Content-Type": mime } };
  }
}

/** R2 answers a missing key with NoSuchKey, or a bare 404 on HeadObject. */
function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e?.name === "NoSuchKey" ||
    e?.name === "NotFound" ||
    e?.$metadata?.httpStatusCode === 404
  );
}
