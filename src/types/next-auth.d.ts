import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    kind?: string;
    locale?: string;
  }
  interface Session {
    user: {
      id: string;
      kind?: string;
      locale?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    kind?: string;
    locale?: string;
  }
}
