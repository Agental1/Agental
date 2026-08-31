import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

/**
 * The previous rule was a bare `Allow: /`, which invited crawlers into the
 * authenticated app, the admin back-office, the login page and the internal
 * styleguide. Those pages carry no SEO value and some carry personal data.
 *
 * Paths are locale-prefixed, so each rule wildcards the locale segment:
 * /fr/talents/app and /es/talents/app must both be excluded.
 *
 * This is discovery control, NOT access control. Anything that must not be
 * readable needs an auth check on the route itself — see /api/media/[id].
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/*/talents/app/",
        "/*/casting/app/",
        "/*/admin/",
        "/*/connexion",
        "/*/styleguide",
        "/api/",
      ],
    },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
