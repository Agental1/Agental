"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { isOAuthProviderId } from "@/lib/auth/oauth-providers";
import { disconnectVerdict } from "@/lib/connected-accounts";
import { err, type ActionError } from "@/domain/action-result";

/**
 * Disconnect Google or Apple from the signed-in account.
 *
 * This removes our record of the link, so that provider no longer opens the
 * account. We store no provider tokens, so there is nothing to revoke on the
 * provider's side: the app stays listed in the person's Google or Apple
 * account until they remove it there.
 *
 * A connection that is the only way in is never removed. With no password
 * and no other provider, the person would be locked out of their account.
 */

export type DisconnectProviderResult = { ok: true } | { ok: false; error: ActionError };

type Verdict = "ok" | "notConnected" | "lastMethod" | "noUser";

export async function disconnectProvider(
  provider: "google" | "apple"
): Promise<DisconnectProviderResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: err("errors.unauthorized") };
  // A name we do not know is a provider that was never connected.
  if (!isOAuthProviderId(provider)) {
    return { ok: false, error: err("errors.providerNotConnected") };
  }

  const verdict = await prisma.$transaction(async (tx): Promise<Verdict> => {
    // Lock the user's row for the length of the transaction. Two disconnects
    // sent together (Google and Apple, no password) then run one after the
    // other, and the second one sees that it would remove the last way in.
    // Only a yes or no about the password is read, never the hash.
    const locked = await tx.$queryRaw<Array<{ hasPassword: boolean }>>`
      SELECT "passwordHash" IS NOT NULL AS "hasPassword"
      FROM "User"
      WHERE "id" = ${userId}
      FOR UPDATE`;
    const user = locked[0];
    if (!user) return "noUser";

    const accounts = await tx.account.findMany({
      where: { userId },
      select: { provider: true },
    });
    const providers = [...new Set(accounts.map((account) => account.provider))].sort();
    const hasPassword = user.hasPassword === true;

    const decided = disconnectVerdict({ hasPassword, providers }, provider);
    if (decided !== "ok") return decided;

    await tx.account.deleteMany({ where: { userId, provider } });
    await audit(
      {
        actorUserId: userId,
        action: "auth.oauth.unlink",
        resourceType: "User",
        resourceId: userId,
        // Provider names only: no subject id, no email.
        before: { providers, hasPassword },
        after: {
          provider,
          providers: providers.filter((name) => name !== provider),
        },
      },
      tx
    );
    return "ok";
  });

  if (verdict === "noUser") return { ok: false, error: err("errors.unauthorized") };
  if (verdict === "notConnected") {
    return { ok: false, error: err("errors.providerNotConnected") };
  }
  if (verdict === "lastMethod") {
    return { ok: false, error: err("errors.lastLoginMethod") };
  }

  // Settings live in both apps; refresh whichever one the person is in.
  revalidatePath("/[locale]/talents/(space)", "layout");
  revalidatePath("/[locale]/casting/(space)", "layout");
  return { ok: true };
}
