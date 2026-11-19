import { completeUpload, createUpload } from "@/app/actions/uploads";
import { err, type ActionError } from "@/domain/action-result";
import {
  baseMime,
  type UploadDestination,
  type UploadType,
} from "@/domain/uploads";
import type { TipKey } from "@/lib/ai/quality-scorer";

/**
 * Send one file from the browser to storage, with progress.
 *
 * Call it from a client component:
 *
 *   const result = await uploadMedia(blob, {
 *     type: "SELFTAPE",
 *     destination: "library",
 *     onProgress: (fraction) => setProgress(fraction),
 *   });
 *
 * Three steps hide behind it: ask the server for an address that accepts this
 * one file, PUT the file there, then ask the server to check what arrived and
 * record it. The file itself never passes through a server action. Which
 * storage vendor sits behind the address is the server's business.
 *
 * Pass the recorder's real blob (rec.mimeType): Safari records MP4, Chrome
 * and Firefox record WebM, and both are accepted.
 */

export interface UploadMediaOptions {
  type: UploadType;
  /** Videos and self-tapes only. Defaults: VIDEO "profile", SELFTAPE "library". */
  destination?: UploadDestination;
  durationSec?: number;
  /** Self-tape quality metrics, each from 0 to 1, as the studio measures them. */
  metrics?: { framing: number; light: number; sound: number; durationMs: number };
  lowBandwidth?: boolean;
  /** Called with a fraction from 0 to 1 as bytes leave the browser. */
  onProgress?: (fraction: number) => void;
  /** Abort the transfer, for a Cancel button. */
  signal?: AbortSignal;
}

export type UploadMediaResult =
  | {
      ok: true;
      mediaId: string;
      score?: number;
      breakdown?: { framing: number; light: number; sound: number };
      tips?: TipKey[];
    }
  | { ok: false; error: ActionError; aborted?: boolean };

export async function uploadMedia(
  file: Blob,
  options: UploadMediaOptions
): Promise<UploadMediaResult> {
  const { type, destination, durationSec, metrics, lowBandwidth, onProgress, signal } =
    options;

  const created = await createUpload({
    type,
    destination,
    mime: baseMime(file.type),
    sizeBytes: file.size,
  });
  if (!created.ok) return created;

  const sent = await put(created.url, created.headers, file, onProgress, signal);
  if (sent !== "done") {
    return {
      ok: false,
      error: err("errors.uploadFailed"),
      ...(sent === "aborted" ? { aborted: true } : {}),
    };
  }

  return completeUpload({
    uploadId: created.uploadId,
    durationSec: durationSec === undefined ? undefined : Math.round(durationSec),
    metrics,
    lowBandwidth,
  });
}

/**
 * XMLHttpRequest, because fetch still reports no upload progress. Resolves
 * with how the transfer ended and never rejects.
 */
function put(
  url: string,
  headers: Record<string, string>,
  body: Blob,
  onProgress: ((fraction: number) => void) | undefined,
  signal: AbortSignal | undefined
): Promise<"done" | "failed" | "aborted"> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve("aborted");

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.min(1, event.loaded / event.total));
      }
    };
    xhr.onload = () => {
      const ok = xhr.status >= 200 && xhr.status < 300;
      if (ok) onProgress?.(1);
      resolve(ok ? "done" : "failed");
    };
    xhr.onerror = () => resolve("failed");
    xhr.ontimeout = () => resolve("failed");
    xhr.onabort = () => resolve("aborted");
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}
