/**
 * Realistic FR demo seed (zero lorem). Idempotent — upserts by stable keys.
 * Run: bun prisma/seed.ts
 *
 * Cachets follow the brief: figuration 80-180€/j, petit rôle 350-800€/j,
 * pub 800-3000€/j, voix 200-800€/séance.
 */
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { toJson } from "../src/domain/json";

const PASSWORD_HASH = bcrypt.hashSync("demo1234", 10);

type RosterSpec = {
  email: string;
  stageName: string;
  city: string;
  birthDate: string;
  specialties: string[];
  accents: string[];
  minRate: number;
};

const ROSTER: RosterSpec[] = [
  { email: "yann@demo.agental.fr", stageName: "Yann Le Goff", city: "Rennes", birthDate: "1994-03-12", specialties: ["seconds-roles"], accents: ["breton"], minRate: 480 },
  { email: "erwan@demo.agental.fr", stageName: "Erwan Tanguy", city: "Brest", birthDate: "1992-07-02", specialties: ["seconds-roles", "figuration"], accents: ["breton"], minRate: 450 },
  { email: "gael@demo.agental.fr", stageName: "Gaël Rioux", city: "Lorient", birthDate: "1990-11-20", specialties: ["seconds-roles"], accents: ["breton"], minRate: 500 },
  { email: "amina@demo.agental.fr", stageName: "Amina B.", city: "Marseille", birthDate: "1991-05-09", specialties: ["publicite", "voix"], accents: [], minRate: 800 },
];

async function upsertTalent(spec: RosterSpec) {
  const user = await prisma.user.upsert({
    where: { email: spec.email },
    create: { email: spec.email, passwordHash: PASSWORD_HASH, kind: "TALENT" },
    update: {},
  });
  const profile = await prisma.artistProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      stageName: spec.stageName,
      city: spec.city,
      birthDate: new Date(spec.birthDate),
      status: "ACTIVE",
      completenessScore: 85,
      minRateCents: spec.minRate * 100,
      physical: toJson({ languages: ["français"], accents: spec.accents }),
      mobilityCountries: toJson(["FR"]),
    },
    update: { status: "ACTIVE" },
    include: { specialties: true },
  });
  // Free plan + signed mandat (represented).
  await prisma.mandat.upsert({
    where: { profileId: profile.id },
    create: { profileId: profile.id, status: "ACTIVE", signedAt: new Date(), signatureIp: "seed" },
    update: {},
  });
  await prisma.subscription.upsert({
    where: { subjectId: user.id },
    create: { subjectType: "ARTIST", subjectId: user.id, plan: "FREE", commissionRate: 0.1 },
    update: {},
  });
  if (profile.specialties.length === 0) {
    await prisma.specialty.createMany({
      data: spec.specialties.map((kind) => ({ profileId: profile.id, kind })),
    });
  }
  return profile;
}

async function main() {
  // Roster talents
  const profiles: Record<string, string> = {};
  for (const spec of ROSTER) {
    const p = await upsertTalent(spec);
    profiles[spec.email] = p.id;
  }

  // External talent (sourced off-roster)
  const external = await prisma.externalTalent.upsert({
    where: { id: "seed-malik" },
    create: {
      id: "seed-malik",
      name: "Malik Benali",
      agency: "Agence Sud",
      data: toJson({ city: "Nantes", accents: ["breton"], minRate: 520 }),
    },
    update: {},
  });

  // Demo casting org + project (the "Marée Haute" brief)
  const owner = await prisma.user.upsert({
    where: { email: "demo-casting@demo.agental.fr" },
    create: { email: "demo-casting@demo.agental.fr", passwordHash: PASSWORD_HASH, kind: "CASTING", emailVerified: new Date() },
    update: {},
  });
  let org = await prisma.organization.findFirst({ where: { name: "Marée Haute (démo)" } });
  if (!org) {
    org = await prisma.organization.create({
      data: { name: "Marée Haute (démo)", siret: "80495782600017", siretStatus: "VERIFIED", plan: "FREE" },
    });
    const seat = await prisma.seat.create({ data: { organizationId: org.id, status: "ACTIVE" } });
    await prisma.membership.create({ data: { userId: owner.id, organizationId: org.id, role: "OWNER", seatId: seat.id } });
    await prisma.subscription.upsert({
      where: { subjectId: org.id },
      create: { subjectType: "ORG", subjectId: org.id, plan: "FREE", seatCount: 1 },
      update: {},
    });
  }

  let project = await prisma.project.findFirst({ where: { organizationId: org.id, title: "Maxime — série Marée Haute" } });
  if (!project) {
    project = await prisma.project.create({
      data: {
        organizationId: org.id,
        title: "Maxime — série Marée Haute",
        status: "SHORTLISTING",
        roleSpec: toJson({ role: "Maxime", gender: "H", ageMin: 25, ageMax: 32, accent: "breton", constraints: ["droits image OK"] }),
        budgetCents: 60000,
      },
    });

    // Scored shortlist
    const shortlist: { profileEmail?: string; externalId?: string; source: string; score: number; rate: number; justification: string }[] = [
      { profileEmail: "yann@demo.agental.fr", source: "AGENTAL", score: 94, rate: 480, justification: "Accent breton natif · fenêtre de tournage OK · droits image OK." },
      { externalId: external.id, source: "EXTERNAL", score: 89, rate: 520, justification: "Sourcé hors roster · même scoring · disponibilité confirmée." },
      { profileEmail: "erwan@demo.agental.fr", source: "AGENTAL", score: 86, rate: 450, justification: "Physique proche du rôle · self-tape vérifié." },
      { profileEmail: "gael@demo.agental.fr", source: "AGENTAL", score: 81, rate: 500, justification: "Expérience séries · accent régional crédible." },
    ];
    for (const item of shortlist) {
      const cand = await prisma.candidature.create({
        data: {
          projectId: project.id,
          artistProfileId: item.profileEmail ? profiles[item.profileEmail] : null,
          externalTalentId: item.externalId ?? null,
          source: item.source,
          status: "SHORTLISTED",
          estimatedRateCents: item.rate * 100,
        },
      });
      await prisma.matchScore.create({
        data: {
          candidatureId: cand.id,
          score: item.score,
          justification: item.justification,
          factors: toJson({ accent: 0.95, availability: 1, rights: 1 }),
        },
      });
    }
  }

  // Career entries for one talent (paid roles with commission)
  const yannId = profiles["yann@demo.agental.fr"];
  const existingCareer = await prisma.careerEntry.count({ where: { profileId: yannId } });
  if (existingCareer === 0) {
    await prisma.careerEntry.createMany({
      data: [
        { profileId: yannId, role: "Figuration — long métrage", cachetCents: 15000, commissionRate: 0.1, commissionCents: 1500, date: new Date("2026-02-10"), status: "PAID" },
        { profileId: yannId, role: "Second rôle — série", cachetCents: 60000, commissionRate: 0.1, commissionCents: 6000, date: new Date("2026-05-22"), status: "PAID" },
      ],
    });
  }

  const counts = {
    users: await prisma.user.count(),
    profiles: await prisma.artistProfile.count(),
    orgs: await prisma.organization.count(),
    projects: await prisma.project.count(),
    candidatures: await prisma.candidature.count(),
    matchScores: await prisma.matchScore.count(),
  };
  console.log("Seed done:", counts);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
