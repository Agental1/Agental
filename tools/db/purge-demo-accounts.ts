/**
 * Remove the demo accounts created by prisma/seed.ts from a database.
 *
 *   pnpm db:purge-demo            # dry run: lists what would be deleted
 *   pnpm db:purge-demo -- --apply # deletes it
 *
 * Point DATABASE_URL at the database you want to clean (e.g. production) in
 * your own shell, then read the dry-run output before using --apply.
 * Matches only users whose email ends in @demo.agental.co.
 */
import "dotenv/config";
import { prisma } from "../../src/lib/db";

const DEMO_DOMAIN = "@demo.agental.co";
const apply = process.argv.includes("--apply");

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: DEMO_DOMAIN } },
    select: { id: true, email: true, isAdmin: true },
  });
  const demoIds = new Set(users.map((u) => u.id));

  // Organisations whose every member is a demo user.
  const memberships = await prisma.membership.findMany({
    where: { userId: { in: [...demoIds] } },
    select: { organizationId: true },
  });
  const orgIds: string[] = [];
  for (const orgId of new Set(memberships.map((m) => m.organizationId))) {
    const members = await prisma.membership.findMany({
      where: { organizationId: orgId },
      select: { userId: true },
    });
    if (members.every((m) => demoIds.has(m.userId))) orgIds.push(orgId);
  }
  const seedExternal = await prisma.externalTalent.findMany({
    where: { id: { startsWith: "seed-" } },
    select: { id: true, name: true },
  });

  console.log(apply ? "APPLYING deletion of:" : "DRY RUN. Would delete:");
  for (const u of users) console.log(`  user ${u.email}${u.isAdmin ? "  (ADMIN)" : ""}`);
  console.log(`  ${orgIds.length} organisation(s) and their projects`);
  for (const e of seedExternal) console.log(`  external talent ${e.name} (${e.id})`);

  if (!apply) {
    console.log("\nNothing changed. Re-run with --apply to delete.");
    return;
  }
  await prisma.subscription.deleteMany({
    where: { subjectId: { in: [...demoIds, ...orgIds] } },
  });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [...demoIds] } } });
  await prisma.externalTalent.deleteMany({ where: { id: { in: seedExternal.map((e) => e.id) } } });
  console.log("Done.");
}

main().finally(() => prisma.$disconnect());
