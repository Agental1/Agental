import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";

/**
 * Catch-all inside the locale segment, so an unmatched path renders OUR 404
 * instead of Next's built-in one.
 *
 * Without it, `/fr/talents/whatever` matches no route at all, Next never enters
 * the [locale] segment, and [locale]/not-found.tsx is never reached — the
 * visitor gets the framework default: unstyled, chromeless, and in English on a
 * French site. Throwing notFound() from inside the segment hands the request to
 * the nearest not-found.tsx, which inherits the layout and the language.
 *
 * setRequestLocale MUST run before notFound(): the not-found page reads
 * translations, and without the request locale established next-intl throws
 * while rendering the 404 itself — which lands the visitor on Next's bare
 * error document instead, with the failure hidden behind a plain 404 status.
 *
 * More specific routes always win over a catch-all, so this shadows nothing.
 */
export default async function CatchAllNotFound({
  params,
}: {
  params: Promise<{ locale: string; rest: string[] }>;
}) {
  const { locale: rawLocale } = await params;
  setRequestLocale(toLocale(rawLocale));
  notFound();
}
