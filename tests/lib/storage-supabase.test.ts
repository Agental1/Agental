import { afterEach, describe, expect, it, vi } from "vitest";
import { bucketFor, SupabaseStorage } from "@/lib/storage/supabase";
import { selectStorage } from "@/lib/storage";

describe("Supabase storage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("puts each kind of file in its private bucket, under the user id", () => {
    expect(bucketFor("u1/selftape/a.webm")).toBe("selftapes");
    expect(bucketFor("u1/avatar/a.jpg")).toBe("avatars");
    expect(bucketFor("u1/media/a.jpg")).toBe("media");
    expect(bucketFor("selftape/p1/a.webm")).toBe("selftapes");
  });

  it("is chosen when both Supabase variables are set, before R2", () => {
    const r2 = { R2_ACCOUNT_ID: "a", R2_BUCKET: "b", R2_ACCESS_KEY_ID: "c", R2_SECRET_ACCESS_KEY: "d" };
    expect(selectStorage({ ...r2, SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }, true).kind).toBe("supabase");
    expect(selectStorage({ ...r2, SUPABASE_URL: "https://x.supabase.co" }, true).kind).toBe("r2");
  });

  it("hands the browser a one-object TUS token, never the service key", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("/object/upload/sign/")) {
        return Response.json({ url: "/object/upload/sign/selftapes/u1/selftape/a.webm?token=tok123" });
      }
      return new Response("{}", { status: 200 });
    }));
    const s = new SupabaseStorage({ url: "https://ref.supabase.co", serviceRoleKey: "service-secret" });
    const out = await s.presignUpload("u1/selftape/a.webm", "video/webm");
    expect(out.tus).toEqual({
      endpoint: "https://ref.storage.supabase.co/storage/v1/upload/resumable/sign",
      token: "tok123",
      bucket: "selftapes",
      objectName: "u1/selftape/a.webm",
      contentType: "video/webm",
    });
    expect(JSON.stringify(out)).not.toContain("service-secret");
    // Buckets are created private.
    const bucketBodies = calls.filter((c) => c.url.endsWith("/bucket")).map((c) => JSON.parse(String(c.init?.body)));
    expect(bucketBodies.map((b) => b.id).sort()).toEqual(["avatars", "media", "selftapes"]);
    expect(bucketBodies.every((b) => b.public === false)).toBe(true);
  });

  it("signs short-lived read URLs, capped at one hour", async () => {
    let body: { expiresIn: number } | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ signedURL: "/object/sign/avatars/u1/avatar/a.jpg?token=t" });
    }));
    const s = new SupabaseStorage({ url: "https://ref.supabase.co", serviceRoleKey: "k" });
    expect(await s.signedUrl("u1/avatar/a.jpg", { expiresInSeconds: 99999 })).toBe(
      "https://ref.supabase.co/storage/v1/object/sign/avatars/u1/avatar/a.jpg?token=t"
    );
    expect(body!.expiresIn).toBe(3600);
  });
});
