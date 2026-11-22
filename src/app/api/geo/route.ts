import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * Places for the location picker (round 8), from our own GeoNames tables: no
 * API key, no third party, small answers.
 *
 *   ?type=countries                       every country, by name
 *   ?type=admin1&country=US               states or provinces of a country
 *   ?type=cities&country=US&admin1=CA&q=  up to 10 cities starting with q,
 *                                         largest first
 *   ?type=city&id=5368361                 one city, to show a stored choice
 *
 * Signed-in people only, since nothing public uses it.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type");
  const country = (sp.get("country") ?? "").toUpperCase().slice(0, 2);
  const cache = { headers: { "Cache-Control": "private, max-age=3600" } };

  if (type === "countries") {
    const rows = await prisma.geoCountry.findMany({ orderBy: { name: "asc" }, select: { code: true, name: true } });
    return NextResponse.json(rows, cache);
  }
  if (type === "admin1") {
    if (!/^[A-Z]{2}$/.test(country)) return NextResponse.json([]);
    const rows = await prisma.geoAdmin1.findMany({
      where: { countryCode: country },
      orderBy: { name: "asc" },
      select: { code: true, name: true },
    });
    return NextResponse.json(rows, cache);
  }
  if (type === "city") {
    const id = Number(sp.get("id"));
    if (!Number.isInteger(id)) return NextResponse.json(null);
    const row = await prisma.geoCity.findUnique({
      where: { geonameId: id },
      select: { geonameId: true, name: true, countryCode: true, admin1Code: true },
    });
    return NextResponse.json(row);
  }
  if (type === "cities") {
    const q = (sp.get("q") ?? "").trim().toLowerCase().slice(0, 60);
    if (!/^[A-Z]{2}$/.test(country) || q.length < 1) return NextResponse.json([]);
    const admin1 = (sp.get("admin1") ?? "").slice(0, 20);
    // Prefix match on the ASCII or the local name (prefix index), largest first.
    const rows = await prisma.geoCity.findMany({
      where: {
        countryCode: country,
        ...(admin1 ? { admin1Code: admin1 } : {}),
        OR: [{ asciiName: { startsWith: q, mode: "insensitive" } }, { name: { startsWith: q, mode: "insensitive" } }],
      },
      orderBy: { population: "desc" },
      take: 10,
      select: { geonameId: true, name: true, admin1Code: true },
    });
    return NextResponse.json(rows);
  }
  return NextResponse.json({ error: "bad request" }, { status: 400 });
}
