import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { LoginInput } from "@/domain/auth";

// Credentials + JWT sessions (Credentials requires JWT). Users are created by
// our signup server action (src/app/actions/auth.ts), so no Prisma adapter is
// needed here; add one alongside OAuth providers later.
export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/connexion" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (raw) => {
        const parsed = LoginInput.safeParse(raw);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user?.passwordHash) return null;
        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          kind: user.kind,
          locale: user.locale,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.kind = user.kind;
        token.locale = user.locale;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.kind =
          typeof token.kind === "string" ? token.kind : undefined;
        session.user.locale =
          typeof token.locale === "string" ? token.locale : undefined;
      }
      return session;
    },
  },
});
