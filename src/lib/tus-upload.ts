import type { TusUpload } from "@/lib/storage";

/**
 * A resumable upload (TUS 1.0) to Supabase Storage, from the browser.
 *
 * The file goes in 6 MB chunks (the size Supabase requires). A chunk that
 * fails is retried after a pause: the server is asked how much it already
 * holds (HEAD) and the upload goes on from there, so a phone that drops off
 * the network for a few seconds does not start the take again.
 *
 * Resolves with how it ended and never rejects.
 */
export const TUS_CHUNK = 6 * 1024 * 1024;
const RETRY_DELAYS_MS = [0, 2000, 5000, 10000, 20000];

type Outcome = "done" | "failed" | "blocked" | "aborted";

function b64(value: string): string {
  return btoa(unescape(encodeURIComponent(value)));
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}

interface Reply {
  status: number;
  header: (name: string) => string | null;
}

function send(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: Blob | null,
  onSent: ((loaded: number) => void) | undefined,
  signal: AbortSignal | undefined
): Promise<Reply | "blocked" | "aborted"> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve("aborted");
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    if (onSent) xhr.upload.onprogress = (e) => onSent(e.loaded);
    xhr.onload = () => resolve({ status: xhr.status, header: (n) => xhr.getResponseHeader(n) });
    xhr.onerror = () => resolve("blocked");
    xhr.ontimeout = () => resolve("blocked");
    xhr.onabort = () => resolve("aborted");
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

export async function tusUpload(
  tus: TusUpload,
  file: Blob,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal
): Promise<Outcome> {
  const base = { "Tus-Resumable": "1.0.0", "x-signature": tus.token };
  const total = file.size;

  const created = await send(
    "POST",
    tus.endpoint,
    {
      ...base,
      "Upload-Length": String(total),
      "x-upsert": "true",
      "Upload-Metadata": [
        `bucketName ${b64(tus.bucket)}`,
        `objectName ${b64(tus.objectName)}`,
        `contentType ${b64(tus.contentType)}`,
        `cacheControl ${b64("3600")}`,
      ].join(","),
    },
    null,
    undefined,
    signal
  );
  if (created === "aborted") return "aborted";
  if (created === "blocked") return "blocked";
  const location = created.header("Location");
  if (created.status !== 201 || !location) return "failed";
  const url = new URL(location, tus.endpoint).toString();

  let offset = 0;
  let attempt = 0;
  while (offset < total) {
    const chunk = file.slice(offset, Math.min(total, offset + TUS_CHUNK));
    const start = offset;
    const res = await send(
      "PATCH",
      url,
      { ...base, "Upload-Offset": String(offset), "Content-Type": "application/offset+octet-stream" },
      chunk,
      (loaded) => onProgress?.(Math.min(1, (start + loaded) / total)),
      signal
    );
    if (res === "aborted") return "aborted";
    if (res !== "blocked" && res.status === 204) {
      offset = Number(res.header("Upload-Offset") ?? offset + chunk.size);
      attempt = 0;
      continue;
    }
    // A refused token or a file the bucket will not take: no point retrying.
    if (res !== "blocked" && res.status >= 400 && res.status < 500 && res.status !== 409) return "failed";
    attempt++;
    if (attempt >= RETRY_DELAYS_MS.length) return res === "blocked" ? "blocked" : "failed";
    await wait(RETRY_DELAYS_MS[attempt], signal);
    if (signal?.aborted) return "aborted";
    // Ask where the server stands, then carry on from there.
    const head = await send("HEAD", url, base, null, undefined, signal);
    if (head === "aborted") return "aborted";
    if (head !== "blocked" && head.status >= 200 && head.status < 300) {
      offset = Number(head.header("Upload-Offset") ?? offset);
    }
  }
  onProgress?.(1);
  return "done";
}
