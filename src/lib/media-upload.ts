import { completeUpload, createUpload } from "@/app/actions/uploads";
import { err, type ActionError } from "@/domain/action-result";
import {
  baseMime,
  type UploadDestination,
  type UploadType,
} from "@/domain/uploads";
import type { TipKey } from "@/lib/ai/quality-scorer";
import { tusUpload } from "@/lib/tus-upload";

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
 *
 * A self-tape is saved as a version of a tape. Pass `tapeId` to add a new
 * version to an existing tape, or leave it out to start a new tape from
 * `title` and `demoBrief`. The result says which tape the file joined:
 *
 *   const result = await uploadMedia(blob, {
 *     type: "SELFTAPE",
 *     tapeId,                      // omit to start a new tape
 *     title: "Monologue, take two",
 *     consentVersion: "2026-11",   // the upload notice the person accepted
 *   });
 *   if (result.ok) result.tapeId, result.takeNumber
 */

export interface UploadMediaOptions {
  type: UploadType;
  /** Videos and self-tapes only. Defaults: VIDEO "profile", SELFTAPE "library". */
  destination?: UploadDestination;
  /**
   * Self-tapes only: the tape this file becomes the next version of. It must
   * be one of the caller's own tapes ("errors.tapeNotFound" otherwise). Left
   * out, the upload starts a new tape.
   */
  tapeId?: string;
  /**
   * Shown with the file. Trimmed, 120 characters at most. On an upload that
   * starts a new tape it is also the tape's title; an existing tape keeps its
   * own (rename it with renameTape).
   */
  title?: string;
  /** Self-tapes only: the brief of the tape this upload starts. 2000 characters at most. */
  demoBrief?: string;
  /**
   * Version of the upload notice the person accepted, 40 characters at most.
   * It records consent to store and show the file, nothing more.
   */
  consentVersion?: string;
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
      /** Self-tapes only: the tape the file joined and its version number. */
      tapeId?: string;
      takeNumber?: number;
      score?: number;
      breakdown?: { framing: number; light: number; sound: number };
      tips?: TipKey[];
    }
  | { ok: false; error: ActionError; aborted?: boolean };

export async function uploadMedia(
  file: Blob,
  options: UploadMediaOptions
): Promise<UploadMediaResult> {
  const {
    type,
    destination,
    tapeId,
    title,
    demoBrief,
    consentVersion,
    durationSec,
    metrics,
    lowBandwidth,
    onProgress,
    signal,
  } = options;

  const created = await createUpload({
    type,
    destination,
    mime: baseMime(file.type),
    sizeBytes: file.size,
    tapeId,
    title,
    demoBrief,
    consentVersion,
  });
  if (!created.ok) return created;

  const sent = created.tus
    ? await tusUpload(created.tus, file, onProgress, signal)
    : await put(created.url, created.headers, file, onProgress, signal);
  if (sent !== "done") {
    return {
      ok: false,
      // "blocked": the browser never got an answer from storage (network, or
      // a storage CORS rule that does not allow this site).
      error: err(sent === "blocked" ? "errors.uploadBlocked" : "errors.uploadFailed"),
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
): Promise<"done" | "failed" | "blocked" | "aborted"> {
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
    xhr.onerror = () => resolve(xhr.status === 0 ? "blocked" : "failed");
    xhr.ontimeout = () => resolve("failed");
    xhr.onabort = () => resolve("aborted");
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}
