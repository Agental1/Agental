import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MessageSquare } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "talents" });

  const session = await auth();
  if (!session?.user?.id) return null;

  const threads = await prisma.thread.findMany({
    where: { messages: { some: { senderId: session.user.id } } },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("space.messages.title")}</h1>
        <p className="text-fg-muted">{t("space.messages.subtitle")}</p>
      </div>
      {threads.length === 0 ? (
        <div className="rounded-sedan border border-dashed border-border bg-surface-2/40 p-10 text-center">
          <MessageSquare className="mx-auto size-8 text-accent" />
          <p className="mx-auto mt-3 max-w-sm text-sm text-fg-muted">{t("space.messages.empty")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-sedan border border-border bg-surface">
          {threads.map((t) => (
            <li key={t.id} className="p-4">
              <p className="font-medium">{t.subject ?? "Conversation"}</p>
              <p className="truncate text-sm text-fg-muted">
                {t.messages[0]?.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
