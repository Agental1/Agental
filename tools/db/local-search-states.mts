/**
 * Local QA only (round 10, group 3): put one LOCAL account in each situation the
 * green button explains, to check every message. Refuses any database that is
 * not on localhost.
 *
 *   DATABASE_URL=<local> pnpm tsx tools/db/local-search-states.mts <email> <state>
 *
 * States: complete (verified Test account at 100%, fresh allowance),
 * unverified, incomplete (clears build and phone), real (UNREVIEWED: test mode),
 * quota (5 searches used), busy (one search running), blocked (SPAM),
 * paused / resume (the pause switch), open / close (the access switch).
 */
import { prisma } from "../../src/lib/db";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("local-search-states: refusing a non-local database");
  process.exit(1);
}
const [email, state] = process.argv.slice(2);
const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { artistProfile: true } });
const now = new Date();

async function complete() {
  const p = user.artistProfile ?? (await prisma.artistProfile.create({ data: { userId: user.id, stageName: "" } }));
  const city = await prisma.geoCity.findFirst({ where: { countryCode: "US", name: "Los Angeles" } });
  await prisma.artistProfile.update({
    where: { id: p.id },
    data: {
      legalFirstName: p.legalFirstName || "Local",
      legalLastName: p.legalLastName || "Tester",
      birthDate: p.birthDate ?? new Date("1995-04-02T00:00:00Z"),
      gender: p.gender || "female",
      city: city?.name ?? "Los Angeles",
      cityGeonameId: city?.geonameId ?? null,
      countryCode: "US",
      phone: "+1 213 555 0123",
      phoneE164: "+12135550123",
      bio: "Local test performer.",
      physical: JSON.stringify({ heightCm: 170, build: "Athletic", hair: "Brown", eyes: "Green", languages: ["English"], accents: [] }),
      preferences: JSON.stringify({ v: 2, merged: true, projectTypes: ["film"], compensation: "paid_or_unpaid", playableAgeMin: 20, playableAgeMax: 30 }),
    },
  });
  if (!(await prisma.media.count({ where: { profileId: p.id, type: "PHOTO", category: "SELF" } }))) {
    await prisma.media.create({ data: { profileId: p.id, type: "PHOTO", category: "SELF", storageKey: `local-qa/${p.id}/photo.jpg`, mime: "image/jpeg" } });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: now, accountStatus: "TEST", searchQuotaResetAt: now, searchPeriodStartedAt: null, deletedAt: null },
  });
  await prisma.roleSearchRequest.updateMany({ where: { userId: user.id, status: { in: ["queued", "running"] } }, data: { status: "canceled", completedAt: now, error: "local qa" } });
}

async function setting(key: string, value: object) {
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
}

switch (state) {
  case "complete":
    await complete();
    break;
  case "unverified":
    await complete();
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: null } });
    break;
  case "incomplete": {
    await complete();
    const p = await prisma.artistProfile.findUniqueOrThrow({ where: { userId: user.id } });
    const physical = { ...JSON.parse(p.physical), build: undefined };
    await prisma.artistProfile.update({ where: { id: p.id }, data: { phone: null, phoneE164: null, physical: JSON.stringify(physical) } });
    break;
  }
  case "real":
    await complete();
    await prisma.user.update({ where: { id: user.id }, data: { accountStatus: "UNREVIEWED" } });
    break;
  case "blocked":
    await complete();
    await prisma.user.update({ where: { id: user.id }, data: { accountStatus: "SPAM" } });
    break;
  case "quota":
  case "busy": {
    await complete();
    const n = state === "quota" ? 5 : 1;
    for (let seq = 1; seq <= n; seq++) {
      await prisma.roleSearchRequest.create({
        data: {
          userId: user.id,
          plan: "FREE",
          periodKey: `p${now.getTime()}`,
          seq,
          clientKey: `localqa_${state}_${seq}_${now.getTime()}`,
          status: state === "quota" ? "done" : "running",
          startedAt: now,
          completedAt: state === "quota" ? now : null,
        },
      });
    }
    await prisma.user.update({ where: { id: user.id }, data: { searchPeriodStartedAt: now } });
    break;
  }
  case "paused":
    await setting("pause", { paused: true, since: now.toISOString() });
    break;
  case "resume":
    await setting("pause", { paused: false, since: null });
    break;
  case "open":
    await setting("search.access", { access: "all_verified", since: now.toISOString() });
    break;
  case "close":
    await setting("search.access", { access: "test_only", since: now.toISOString() });
    break;
  default:
    console.error("unknown state");
    process.exit(1);
}
console.log(`local-search-states: ${email} -> ${state}`);
await prisma.$disconnect();
