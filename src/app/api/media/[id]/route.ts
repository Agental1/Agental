import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";

/** Serve a stored media object by its Media row id. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const media = await prisma.media.findUnique({ where: { id } });
  if (!media) return new Response("Not found", { status: 404 });

  const storage = await getStorage();
  const obj = await storage.get(media.storageKey);
  if (!obj) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(obj.bytes), {
    headers: {
      "Content-Type": obj.mime,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
