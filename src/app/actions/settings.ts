"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { routing } from "@/i18n/routing";
import { err, type ActionError } from "@/domain/action-result";

export type SettingsResult = { ok: true } | { ok: false; error: ActionError };

const Language = z.object({ locale: z.enum(routing.locales) });

/**
 * The language of the app and of the emails, saved on the account. (Every
 * signed-in page also writes the language it is shown in, so the account and
 * the page cannot drift: this is the explicit choice that moves both.)
 */
export async function saveLanguage(input: unknown): Promise<SettingsResult> {
  const parsed = Language.safeParse(input);
  if (!parsed.success) return { ok: false, error: err("errors.invalidInput") };
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: err("errors.unauthorized") };
  await prisma.user.update({ where: { id: session.user.id }, data: { locale: parsed.data.locale } });
  return { ok: true };
}

const Notifications = z.object({
  applications: z.boolean(),
  messages: z.boolean(),
  product: z.boolean(),
});

/** Which emails to send. Product news is opt-in; the other two default on. */
export async function saveNotifications(input: unknown): Promise<SettingsResult> {
  const parsed = Notifications.safeParse(input);
  if (!parsed.success) return { ok: false, error: err("errors.invalidInput") };
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: err("errors.unauthorized") };
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      notifyApplications: parsed.data.applications,
      notifyMessages: parsed.data.messages,
      notifyProduct: parsed.data.product,
    },
  });
  return { ok: true };
}
