import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { currentAdminId } from "@/lib/limelight/admin";
import { getStorage, type Storage as ObjectStorage } from "@/lib/storage";
import { WithLegacyReads } from "@/lib/storage/legacy";
import { BUCKETS, bucketFor } from "@/lib/storage/supabase";
import { prisma } from "@/lib/db";

/** Supabase Free plan: 1 GB of storage for the whole project. */
const FREE_PLAN_BYTES = 1024 ** 3;
/** Leave a fifth of the plan for uploads made while the copy runs. */
const FREE_PLAN_HEADROOM = 0.8;
/** Storage requests in flight at once: fast enough for maxDuration, gentle on rate limits. */
const HEAD_CONCURRENCY = 10;
/** Files copied per call. */
const COPY_BATCH = 25;
/**
 * Work stops being started this long after the request began, well inside
 * maxDuration (60 s): the dry run answers with partial numbers, the copy
 * leaves the rest for the next call.
 */
const TIME_BUDGET_MS = 40_000;

type Head = { size: number } | null | "error";

/** HEAD every key, ten at a time, until the deadline. Failures are recorded, not thrown. */
async function headAll(
  store: ObjectStorage,
  keys: string[],
  deadline: number
): Promise<{ heads: Map<string, Head>; complete: boolean }> {
  const heads = new Map<string, Head>();
  for (let i = 0; i < keys.length; i += HEAD_CONCURRENCY) {
    if (Date.now() > deadline) return { heads, complete: false };
    const batch = keys.slice(i, i + HEAD_CONCURRENCY);
    const results = await Promise.all(
      batch.map((key) => store.head(key).catch(() => "error" as const))
    );
    batch.forEach((key, j) => heads.set(key, results[j]));
  }
  return { heads, complete: true };
}

function bytesOf(heads: Map<string, Head>, keys?: Iterable<string>): number {
  let total = 0;
  for (const key of keys ?? heads.keys()) {
    const h = heads.get(key);
    if (h && h !== "error") total += h.size;
  }
  return total;
}

function errorsIn(heads: Map<string, Head>): number {
  let n = 0;
  for (const h of heads.values()) if (h === "error") n++;
  return n;
}

/** A short hash of a key, so logs can tell failures apart without naming files. */
function keyRef(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

/**
 * Copy files saved on R2 (before the move) into Supabase Storage. Admins only.
 * Answers counts and sizes only, never keys or URLs.
 *
 * Which files are left is decided from the two listings and the database,
 * never from a HEAD that might fail: every R2 file an account points to (a
 * media row or a profile picture) that Supabase does not list stays in
 * `left` until it is copied. R2 files no account points to are never copied
 * (they could be personal data from a deleted account); they are counted as
 * `unreferencedOnR2` and stay on R2 until R2 is retired.
 *
 * GET (dry run): counts and sizes. `fitsFreePlan` compares what Supabase
 * already holds plus what is left to copy with 80% of the Free plan; it is
 * null when a size could not be read (`sizeErrors`) or the time budget ran
 * out (`complete: false`). It also checks every file the database points at
 * (media rows and profile pictures). `referencedMissingEverywhere` counts
 * files lost before the move; copying cannot bring those back.
 *
 * GET ?copy=1: copies up to 25 files per call. A file that cannot be copied
 * is passed over so the others still move: `failed` (logged by a hash of its
 * key), `tooBig` (over its bucket's size limit, not downloaded) or `vanished`
 * (gone from R2 since the listing). Run it until `left` is 0, or until a call
 * copies nothing, which means every remaining file is one of those three.
 * The move is done when the dry run shows `notYetCopied` and
 * `referencedOnlyOnR2` at 0 with `complete: true`.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const deadline = Date.now() + TIME_BUDGET_MS;
  if (!(await currentAdminId())) return new NextResponse("Not found", { status: 404 });
  const storage = await getStorage();
  if (!(storage instanceof WithLegacyReads)) {
    return NextResponse.json({ note: "Nothing to copy: Supabase or R2 is not configured." });
  }
  const [onR2, inSupabase] = await Promise.all([
    storage.legacy.list("").then((keys) => keys.filter((k) => !k.startsWith("healthcheck/"))),
    storage.primary.list(""),
  ]);
  const onSupabase = new Set(inSupabase);

  // Only files an account still points to are copied. An R2 file nothing
  // references (a replaced picture, a file whose R2 delete failed after its
  // account was deleted) stays on R2 and is only counted: copying it would
  // bring deleted personal data back into Supabase.
  const [media, avatars] = await Promise.all([
    prisma.media.findMany({ select: { storageKey: true } }),
    prisma.artistProfile.findMany({ where: { avatarKey: { not: null } }, select: { avatarKey: true } }),
  ]);
  const referenced = new Set<string>([
    ...media.map((m) => m.storageKey),
    ...avatars.map((p) => p.avatarKey as string),
  ]);
  const missing = onR2.filter((k) => !onSupabase.has(k) && referenced.has(k));
  const unreferencedOnR2 = onR2.filter((k) => !referenced.has(k)).length;

  if (!new URL(req.url).searchParams.has("copy")) {
    const r2 = await headAll(storage.legacy, onR2, deadline);
    const supa = await headAll(storage.primary, inSupabase, deadline);
    const complete = r2.complete && supa.complete;
    const sizeErrors = errorsIn(r2.heads) + errorsIn(supa.heads);
    const bytesNotYetCopied = bytesOf(r2.heads, missing);
    const bytesInSupabase = bytesOf(supa.heads);

    const r2Set = new Set(onR2);
    let referencedOnlyOnR2 = 0;
    let referencedMissingEverywhere = 0;
    for (const key of referenced) {
      if (onSupabase.has(key)) continue;
      if (r2Set.has(key)) referencedOnlyOnR2++;
      else referencedMissingEverywhere++;
    }

    return NextResponse.json({
      complete,
      onR2: onR2.length,
      notYetCopied: missing.length,
      sizeErrors,
      bytesOnR2: bytesOf(r2.heads),
      bytesNotYetCopied,
      bytesInSupabase,
      fitsFreePlan:
        complete && sizeErrors === 0
          ? bytesInSupabase + bytesNotYetCopied <= FREE_PLAN_BYTES * FREE_PLAN_HEADROOM
          : null,
      referencedFiles: referenced.size,
      referencedOnlyOnR2,
      referencedMissingEverywhere,
      unreferencedOnR2,
    });
  }

  let copied = 0;
  let failed = 0;
  let tooBig = 0;
  let vanished = 0;
  for (const key of missing) {
    if (copied >= COPY_BATCH || Date.now() > deadline) break;
    try {
      const head = await storage.legacy.head(key);
      if (!head) {
        vanished++;
        continue;
      }
      if (head.size > BUCKETS[bucketFor(key)].fileSizeLimit) {
        tooBig++;
        continue;
      }
      const obj = await storage.legacy.get(key);
      if (!obj) {
        vanished++;
        continue;
      }
      await storage.primary.put(key, obj.bytes, obj.mime);
      copied++;
    } catch (error) {
      failed++;
      // The name only: storage error messages can carry the object's path.
      console.error(`[storage-copy] failed ${keyRef(key)}`, error instanceof Error ? error.name : "unknown");
    }
  }
  return NextResponse.json({ copied, failed, tooBig, vanished, left: missing.length - copied });
}
