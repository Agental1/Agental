import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import QRCode from "qrcode";
import { toLocale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isAdminAccount } from "@/domain/admin";
import { newTotpSecret, otpauthUri } from "@/domain/totp";
import { ADMIN_MFA_HOURS, adminMfaSatisfied, decryptSecret, encryptSecret } from "@/lib/admin-mfa";
import { AdminCodeForm } from "@/components/admin/admin-code-form";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "app" });
  return { title: t("admin.mfa.title"), robots: { index: false }, referrer: "no-referrer" };
}

/**
 * Round 8d: the admin's second factor. First visit: scan a QR code (or type
 * the key) in an authenticator app, then type a code. Later: type a code. The
 * pending secret is kept, so a reload shows the same QR code.
 */
export default async function AdminSecurityPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "app" });

  const session = await auth();
  if (!session?.user?.id) return redirect({ href: `/connexion?next=${encodeURIComponent(`/${locale}/securite-admin`)}`, locale });
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, isAdmin: true, email: true } });
  if (!me || !isAdminAccount(me)) notFound();
  if (await adminMfaSatisfied(me.id)) return redirect({ href: "/admin", locale });

  let row = await prisma.adminTotp.findUnique({ where: { userId: me.id } });
  if (!row) {
    row = await prisma.adminTotp.upsert({
      where: { userId: me.id },
      create: { userId: me.id, secretEnc: encryptSecret(newTotpSecret()) },
      update: {},
    });
  }
  const enrolling = !row.verifiedAt;
  let qr: string | null = null;
  let key: string | null = null;
  if (enrolling) {
    const secret = decryptSecret(row.secretEnc);
    qr = await QRCode.toString(otpauthUri(secret, me.email), { type: "svg", margin: 1, width: 200 });
    key = secret.match(/.{1,4}/g)?.join(" ") ?? secret;
  }

  return (
    <div className="space-y-5 rounded-sedan-xl border border-border bg-surface p-6">
      <h1 className="font-display text-2xl font-medium">{t("admin.mfa.title")}</h1>
      {enrolling ? (
        <>
          <p className="text-sm text-fg-muted">{t("admin.mfa.enrollLead")}</p>
          <p className="text-sm font-medium">{t("admin.mfa.step1")}</p>
          {/* An SVG we generated from our own otpauth link. */}
          <div className="mx-auto w-52 rounded-sedan bg-white p-2" dangerouslySetInnerHTML={{ __html: qr! }} />
          <p className="text-sm font-medium">{t("admin.mfa.step2")}</p>
          <p className="select-all break-all rounded-sedan bg-surface-2 px-3 py-2 font-mono text-sm">{key}</p>
          <p className="text-sm font-medium">{t("admin.mfa.step3")}</p>
        </>
      ) : (
        <p className="text-sm text-fg-muted">{t("admin.mfa.verifyLead", { hours: ADMIN_MFA_HOURS })}</p>
      )}
      <AdminCodeForm
        labels={{ code: t("admin.mfa.code"), submit: t("admin.mfa.submit"), submitting: t("admin.mfa.submitting") }}
      />
      <p className="text-xs text-fg-muted">{t("admin.mfa.lost")}</p>
    </div>
  );
}
