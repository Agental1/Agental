import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { baseMime } from "@/domain/uploads";

/**
 * Development stand-in for a signed upload URL.
 *
 * In production the browser PUTs a file straight to object storage with the
 * address createUpload signed. Local disk has no such address, so in
 * development the same PUT lands here and is written to .uploads/. When the
 * storage backend can sign uploads itself this route answers 404: a file must
 * never travel through the app there (request bodies are capped at a few MB).
 *
 * The checks mirror what a signed URL enforces: the caller owns the pending
 * upload, it has not expired, and the body is exactly the declared size.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const storage = await getStorage();
  if (storage.presignUpload) return new Response("Not found", { status: 404 });

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Not found", { status: 404 });

  const upload = await prisma.upload.findUnique({
    where: { id },
    include: { profile: { select: { userId: true } } },
  });
  if (!upload || upload.profile.userId !== userId) {
    return new Response("Not found", { status: 404 });
  }
  if (upload.expiresAt.getTime() < Date.now()) {
    return new Response("Upload expired", { status: 410 });
  }
  if (baseMime(req.headers.get("content-type")) !== upload.mime) {
    return new Response("Unexpected content type", { status: 400 });
  }

  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length !== upload.sizeBytes) {
    return new Response("Unexpected size", { status: 400 });
  }
  await storage.put(upload.storageKey, bytes, upload.mime);
  return new Response(null, { status: 200 });
}
