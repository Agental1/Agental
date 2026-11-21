import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { publicSiteByName } from "@/lib/limelight/public-site";
import { TemplateArt } from "@/components/talents/template-art";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const site = await publicSiteByName((await params).name);
  if (!site) return { title: "Agental", robots: { index: false } };
  return { title: site.content.name, description: site.content.headline || undefined };
}

/** A performer's published Limelight site, at /s/<name>. */
export default async function PublicSitePage({ params }: { params: Promise<{ locale: string; name: string }> }) {
  const { locale, name } = await params;
  setRequestLocale(toLocale(locale));
  const site = await publicSiteByName(name);
  if (!site) notFound();
  const c = site.content;

  return (
    <main id="main" className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:py-16">
      <div className="overflow-hidden rounded-sedan-xl border border-border">
        <TemplateArt template={site.template} name={c.name} headline={c.headline} />
      </div>
      <header className="flex items-center gap-5">
        {site.avatar && (
          // eslint-disable-next-line @next/next/no-img-element -- signed, private route
          <img src={site.avatar} alt="" width={96} height={96} className="size-24 shrink-0 rounded-full object-cover" />
        )}
        <div>
          <h1 className="text-[clamp(28px,4vw,44px)] font-bold leading-tight tracking-[-0.02em]">{c.name}</h1>
          {c.headline && <p className="mt-1 text-lg text-fg-muted">{c.headline}</p>}
        </div>
      </header>
      {c.bio && <p className="whitespace-pre-line text-[17px] leading-relaxed">{c.bio}</p>}
      {c.credits.length > 0 && (
        <ul className="space-y-2">
          {c.credits.map((cr, i) => (
            <li key={i} className="flex flex-wrap gap-x-3 border-b border-border pb-2 text-[15px]">
              <span className="font-bold">{cr.title}</span>
              <span className="text-fg-muted">{cr.role}</span>
              {cr.year && <span className="text-fg-subtle">{cr.year}</span>}
            </li>
          ))}
        </ul>
      )}
      {(c.links.length > 0 || c.contactEmail) && (
        <ul className="flex flex-wrap gap-3">
          {c.links.map((l) => (
            <li key={l.url}>
              <a href={l.url} rel="noopener noreferrer nofollow" target="_blank" className="font-bold text-accent hover:underline">
                {l.label}
              </a>
            </li>
          ))}
          {c.contactEmail && (
            <li>
              <a href={`mailto:${c.contactEmail}`} className="font-bold text-accent hover:underline">
                {c.contactEmail}
              </a>
            </li>
          )}
        </ul>
      )}
      <p className="text-[13px] text-fg-subtle">Agental Limelight</p>
    </main>
  );
}
