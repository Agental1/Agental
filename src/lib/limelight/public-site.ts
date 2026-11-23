import { prisma } from "@/lib/db";
import { SiteTemplate, parseSiteContent, withoutContactFields } from "@/domain/site";
import { avatarSrc } from "@/domain/avatar";

/**
 * A published site by its name (the subdomain label), for /s/<name>. Only a
 * site that is PUBLISHED with a published revision answers; "Take offline"
 * clears that, so the page is gone on the next request (nothing is cached).
 * Contact fields are dropped unless the owner turned the contact switch on.
 */
export async function publicSiteByName(name: string) {
  const label = name.trim().toLowerCase();
  if (!/^[a-z0-9-]{3,40}$/.test(label)) return null;
  const site = await prisma.site.findFirst({
    where: { subdomain: label, status: "PUBLISHED", publishedRevisionId: { not: null }, user: { deletedAt: null } },
    select: {
      id: true,
      userId: true,
      showContact: true,
      publishedRevisionId: true,
      user: { select: { artistProfile: { select: { avatarKey: true, avatarUpdatedAt: true } } } },
    },
  });
  if (!site?.publishedRevisionId) return null;
  const revision = await prisma.siteRevision.findFirst({
    where: { id: site.publishedRevisionId, siteId: site.id },
    select: { template: true, content: true },
  });
  if (!revision) return null;
  const template = SiteTemplate.safeParse(revision.template);
  const content = parseSiteContent(revision.content);
  if (!template.success || !content) return null;
  const p = site.user.artistProfile;
  return {
    template: template.data,
    content: site.showContact ? content : withoutContactFields(content),
    avatar: p?.avatarKey ? avatarSrc(site.userId, p.avatarUpdatedAt) : null,
  };
}
