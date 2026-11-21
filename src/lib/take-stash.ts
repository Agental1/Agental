"use client";

import type { QualityMetrics } from "@/lib/ai/quality-scorer";
import type { UploadDestination } from "@/domain/uploads";

/**
 * Keeps one recorded take in this browser while the performer signs in again,
 * so an expired session does not cost them the take. IndexedDB, because a
 * video is far too large for localStorage. Every call is best effort: private
 * windows and blocked storage simply keep nothing, and the take is lost as it
 * would have been before.
 *
 * The take never leaves the device here; it is deleted once read back, and
 * entries older than a day are ignored.
 */
export interface StashedTake {
  blob: Blob;
  metrics: QualityMetrics;
  destination: UploadDestination;
  savedAt: number;
}

const DB = "agental-studio";
const STORE = "takes";
const KEY = "pending";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const req = fn(db.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        } finally {
          db.close();
        }
      })
  );
}

export async function stashTake(take: Omit<StashedTake, "savedAt">): Promise<boolean> {
  const done = await run("readwrite", (s) => s.put({ ...take, savedAt: Date.now() }, KEY));
  return done !== null;
}

/** The stashed take, removed from storage as it is read. */
export async function takeStashed(): Promise<StashedTake | null> {
  const found = (await run<StashedTake | undefined>("readonly", (s) => s.get(KEY))) ?? null;
  if (found) await run("readwrite", (s) => s.delete(KEY));
  if (!found || !(found.blob instanceof Blob) || Date.now() - found.savedAt > MAX_AGE_MS) return null;
  return found;
}
