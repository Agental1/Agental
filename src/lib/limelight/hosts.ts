import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  SiteTemplate,
  parseSiteContent,
  withoutContactFields,
  type SiteContent,
} from "@/domain/site";
import { normalizeHostname } from "./hostname";

export { normalizeHostname } from "./hostname";

/**
 * From a hostname to the site the public sees there.
 *
 * The answer is always the PUBLISHED REVISION: the snapshot the customer
 * approved and someone then published. The working draft on the Site row is
 * never read here, so an edit in progress cannot leak to the public page.
 */

export interface ResolvedSite {
  siteId: string;
  template: SiteTemplate;
  content: SiteContent;
  showContact: boolean;
}

export type HostDb = Pick<PrismaClient, "siteDomain" | "siteRevision">;

/**
 * The published site served at `hostname`, or null.
 *
 * Null covers every case that must look like "no such site": a value that is
 * not a plain hostname, an unknown host, a domain that is not ACTIVE yet, a
 * site that is a draft or was unpublished, a published revision that is
 * missing or no longer parses. The caller answers 404 for all of them alike.
 *
 * When the owner has not turned `showContact` on, the contact fields
 * (`SITE_CONTACT_FIELDS`) are removed here, on the server, so a template
 * cannot show them by mistake.
 */
export async function resolveSiteByHost(
  hostname: string,
  db: HostDb = prisma
): Promise<ResolvedSite | null> {
  const host = normalizeHostname(hostname);
  if (!host) return null;

  const domain = await db.siteDomain.findFirst({
    where: {
      hostname: host,
      status: "ACTIVE",
      site: { status: "PUBLISHED", publishedRevisionId: { not: null } },
    },
    select: {
      site: { select: { id: true, showContact: true, publishedRevisionId: true } },
    },
  });
  const site = domain?.site;
  if (!site?.publishedRevisionId) return null;

  // The site id is part of the condition: a revision id that points at
  // another site's revision matches nothing.
  const revision = await db.siteRevision.findFirst({
    where: { id: site.publishedRevisionId, siteId: site.id },
    select: { template: true, content: true },
  });
  if (!revision) return null;

  const template = SiteTemplate.safeParse(revision.template);
  const content = parseSiteContent(revision.content);
  if (!template.success || !content) return null;

  return {
    siteId: site.id,
    template: template.data,
    content: site.showContact ? content : withoutContactFields(content),
    showContact: site.showContact,
  };
}
