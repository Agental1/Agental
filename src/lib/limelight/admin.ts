import { isVerifiedAdmin } from "@/lib/admin-mfa";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * Round 8d: and the admin typed their two-factor code (src/lib/admin-mfa.ts).
 *
 * The signed-in admin's user id, or null for everyone else: a visitor, a
 * signed-in account that is not an admin, a session whose user row is gone.
 *
 * `isAdmin` is read from the database on every call, never from the session
 * token, so removing the flag takes effect at once. In the Limelight module
 * an admin is the operator.
 */
export async function currentAdminId(): Promise<string | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const me = await prisma.user.findUnique({
    where: { id },
    select: { isAdmin: true, email: true },
  });
  return (await isVerifiedAdmin(me && { id, ...me })) ? id : null;
}
