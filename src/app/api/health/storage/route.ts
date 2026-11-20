import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import { siteOrigins } from "@/lib/storage/cors-probe";

/**
 * Can a browser on our site upload straight to storage?
 *
 * Direct uploads are a cross-origin PUT, so the bucket must allow our origins
 * (CORS). This asks storage for an upload address for a probe key that is
 * never written, then sends the browser's preflight from the server and
 * reports, per origin, whether storage would let the PUT through. Nothing
 * secret leaves: no URL, no key, only booleans and status codes.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let storage;
  try {
    storage = await getStorage();
  } catch {
    return NextResponse.json({ storage: "unconfigured", directUploads: false }, { status: 503 });
  }
  if (!storage.presignUpload) {
    return NextResponse.json({ storage: "local", directUploads: false, note: "uploads go through /api/uploads" });
  }
  const signed = await storage.presignUpload("healthcheck/cors-probe.webm", "video/webm", 1);
  const url = signed.tus?.endpoint ?? signed.url;
  const method = signed.tus ? "POST" : "PUT";
  const results = await Promise.all(
    siteOrigins().map(async (origin) => {
      try {
        const res = await fetch(url, {
          method: "OPTIONS",
          headers: {
            Origin: origin,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": signed.tus
              ? "tus-resumable,upload-length,upload-metadata,x-signature,x-upsert"
              : "content-type",
          },
          cache: "no-store",
        });
        const allowOrigin = res.headers.get("access-control-allow-origin");
        const allowMethods = res.headers.get("access-control-allow-methods") ?? "";
        const allowed =
          res.ok &&
          (allowOrigin === "*" || allowOrigin === origin) &&
          new RegExp(`\\b${method}\\b`, "i").test(allowMethods);
        return { origin, status: res.status, allowed };
      } catch {
        return { origin, status: 0, allowed: false };
      }
    })
  );
  return NextResponse.json(
    { storage: signed.tus ? "supabase" : "r2", directUploads: results.every((r) => r.allowed), origins: results },
    { headers: { "Cache-Control": "no-store" } }
  );
}
