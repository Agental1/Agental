/**
 * Trim and lowercase every User.email, the form signup now stores.
 *
 *   bun tools/db/lowercase-emails.ts           # dry run: lists changes and collisions
 *   bun tools/db/lowercase-emails.ts --apply   # writes the changes
 *
 * The migration 20261120000000_normalize_user_emails does the same rewrite on
 * deploy, and refuses to run while two accounts share an email once
 * lowercased. The dry run lists those pairs, so they can be settled before
 * the deploy or after it stops.
 *
 * Point DATABASE_URL at the database you want to fix in your own shell, then
 * read the dry-run output before using --apply. Emails that collide once
 * lowercased (two accounts for "Ana@x.com" and "ana@x.com") are reported and
 * never touched, with or without --apply: merging accounts is a human call.
 */
import "dotenv/config";
import { prisma } from "../../src/lib/db";
import { planEmailBackfill } from "../../src/lib/auth/email-backfill";

const apply = process.argv.includes("--apply");

async function main() {
  const rows = await prisma.user.findMany({ select: { id: true, email: true } });
  const plan = planEmailBackfill(rows);

  console.log(apply ? "APPLYING:" : "DRY RUN. Would change:");
  for (const u of plan.updates) console.log(`  ${u.id}  ${u.from} -> ${u.to}`);
  console.log(`  ${plan.updates.length} email(s) to rewrite`);

  if (plan.collisions.length) {
    console.log(`\n${plan.collisions.length} collision(s), left unchanged:`);
    for (const c of plan.collisions) {
      console.log(`  ${c.normalized}: ${c.rows.map((r) => `${r.id} (${r.email})`).join(", ")}`);
    }
  }

  if (!apply) {
    console.log("\nNothing changed. Re-run with --apply to write.");
    return;
  }
  await prisma.$transaction(
    plan.updates.map((u) =>
      prisma.user.update({ where: { id: u.id }, data: { email: u.to } })
    )
  );
  console.log("Done.");
}

main().finally(() => prisma.$disconnect());
