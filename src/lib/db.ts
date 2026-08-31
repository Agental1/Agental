import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/**
 * Prisma 7 requires a driver adapter. We use `pg` against PostgreSQL (Supabase)
 * in every environment, so local and production run the same engine — the
 * previous split (SQLite locally, "PostgreSQL eventually") meant no local run
 * ever exercised the database the site actually serves from.
 *
 * DATABASE_URL is read, never defaulted. It used to fall back to
 * `file:./dev.db`, which is gitignored and therefore absent on a build host: a
 * deployment with no database configured came up looking healthy and failed at
 * the first query. A missing connection string is a configuration error and
 * says so here, once, with the fix in the message.
 *
 * Use the pooled Supabase connection string (port 6543) for the app: serverless
 * functions open a connection per invocation and exhaust a direct pool. Schema
 * migrations need the direct connection instead — see DIRECT_URL in .env.example.
 */
function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and point it at your " +
        "PostgreSQL database (Supabase: Project Settings → Database → Connection " +
        "string → Transaction pooler). On Vercel, set it in Project Settings → " +
        "Environment Variables."
    );
  }
  return new PrismaClient({ adapter: new PrismaPg(url) });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
