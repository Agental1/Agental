import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    // The portraits are local static imports, so no remotePatterns are needed.
    // This only widens the negotiated output: AVIF first, WebP as the fallback.
    formats: ["image/avif", "image/webp"],
  },
  // Keep Prisma + the libSQL driver out of the bundle; load them at runtime.
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-libsql",
    "@libsql/client",
    "libsql",
  ],
};

export default withNextIntl(nextConfig);
