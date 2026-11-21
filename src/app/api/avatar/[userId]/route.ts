import { isAdminAccount } from "@/domain/admin";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";

/**
 * A performer's profile picture.
 *
 * Who may see it: the performer, an admin, and anyone once the performer has
 * a published Limelight site (the picture is on it). Everyone else gets 404,
 * the same answer as "no picture". Storage stays private: R2 answers with a
 * five-minute signed URL, local disk streams the bytes.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(userId)) return new NextResponse(null, { status: 404 });

  const profile = await prisma.artistProfile.findUnique({
    where: { userId },
    select: { avatarKey: true },
  });
  if (!profile?.avatarKey) return new NextResponse(null, { status: 404 });

  const session = await auth();
  let allowed = session?.user?.id === userId;
  if (!allowed && session?.user?.id) {
    const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isAdmin: true, email: true } });
    allowed = isAdminAccount(me);
  }
  if (!allowed) {
    const live = await prisma.site.count({ where: { userId, status: "PUBLISHED", publishedAt: { not: null } } });
    allowed = live > 0;
  }
  if (!allowed) return new NextResponse(null, { status: 404 });

  const storage = await getStorage();
  if (storage.signedUrl) {
    const url = await storage.signedUrl(profile.avatarKey, { expiresInSeconds: 300 });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=240" } });
  }
  const obj = await storage.get(profile.avatarKey);
  if (!obj) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(obj.bytes), {
    headers: { "Content-Type": obj.mime, "Cache-Control": "private, max-age=240" },
  });
}
