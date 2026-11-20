import { NextResponse } from "next/server";
import { currentAdminId } from "@/lib/limelight/admin";
import { getStorage } from "@/lib/storage";
import { WithLegacyReads } from "@/lib/storage/legacy";

/**
 * Copy files saved on R2 (before the move) into Supabase Storage. Admins only.
 * GET shows counts; GET ?copy=1 copies up to 25 files per call (run it again
 * until "left" is 0). Idempotent: a file already in Supabase is skipped.
 * Answers counts only, never keys or URLs.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!(await currentAdminId())) return new NextResponse("Not found", { status: 404 });
  const storage = await getStorage();
  if (!(storage instanceof WithLegacyReads)) {
    return NextResponse.json({ note: "Nothing to copy: Supabase or R2 is not configured." });
  }
  const keys = (await storage.legacy.list("")).filter((k) => !k.startsWith("healthcheck/"));
  const missing: string[] = [];
  for (const key of keys) if (!(await storage.primary.head(key))) missing.push(key);
  if (!new URL(req.url).searchParams.has("copy")) {
    return NextResponse.json({ onR2: keys.length, notYetCopied: missing.length });
  }
  let copied = 0;
  let failed = 0;
  for (const key of missing.slice(0, 25)) {
    try {
      const obj = await storage.legacy.get(key);
      if (obj) {
        await storage.primary.put(key, obj.bytes, obj.mime);
        copied++;
      }
    } catch {
      failed++;
    }
  }
  return NextResponse.json({ copied, failed, left: missing.length - copied });
}
