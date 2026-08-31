import {
  DeleteObjectCommand,
  GetObjectCommand,
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

/** How long a presigned read URL stays valid. */
const SIGNED_URL_TTL_SECONDS = 300;

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
  async signedUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: SIGNED_URL_TTL_SECONDS }
    );
  }
}

/** R2 answers a missing key with NoSuchKey, or a bare 404 on HeadObject. */
function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}
