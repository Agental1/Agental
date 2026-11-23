import { prisma } from "@/lib/db";
import { RoleSpec, parseJson } from "@/domain/json";

/**
 * Round 9, group 1: Admin > Projects, the casting projects with their owner,
 * dates, role and applications. Server only; every caller checks
 * currentAdminId().
 */

export interface ProjectRow {
  id: string;
  title: string;
  status: string;
  organization: string;
  owner: { id: string; email: string; name: string } | null;
  createdAt: Date;
  shootingFrom: Date | null;
  shootingTo: Date | null;
  applications: number;
}

export async function listProjects(q?: string): Promise<ProjectRow[]> {
  const term = q?.trim().slice(0, 100);
  const projects = await prisma.project.findMany({
    where: term
      ? {
          OR: [
            { title: { contains: term, mode: "insensitive" } },
            { organization: { name: { contains: term, mode: "insensitive" } } },
          ],
        }
      : {},
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      shootingFrom: true,
      shootingTo: true,
      organization: {
        select: {
          name: true,
          memberships: {
            where: { role: "OWNER" },
            take: 1,
            select: { user: { select: { id: true, email: true, name: true } } },
          },
        },
      },
      createdBy: {
        select: { user: { select: { id: true, email: true, name: true } } },
      },
      _count: { select: { candidatures: true } },
    },
  });
  return projects.map((p) => {
    // The member who created it, else the organization's owner (same as the detail page).
    const u = p.createdBy?.user ?? p.organization.memberships[0]?.user ?? null;
    return {
      id: p.id,
      title: p.title,
      status: p.status,
      organization: p.organization.name,
      owner: u ? { id: u.id, email: u.email, name: u.name ?? "" } : null,
      createdAt: p.createdAt,
      shootingFrom: p.shootingFrom,
      shootingTo: p.shootingTo,
      applications: p._count.candidatures,
    };
  });
}

export async function projectDetail(id: string) {
  const p = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      roleSpec: true,
      budgetCents: true,
      createdAt: true,
      updatedAt: true,
      shootingFrom: true,
      shootingTo: true,
      organization: {
        select: {
          id: true,
          name: true,
          plan: true,
          memberships: {
            where: { role: "OWNER" },
            select: { user: { select: { id: true, email: true, name: true } } },
          },
        },
      },
      createdBy: {
        select: { user: { select: { id: true, email: true, name: true } } },
      },
      candidatures: {
        orderBy: { appliedAt: "desc" },
        select: {
          id: true,
          status: true,
          source: true,
          appliedAt: true,
          matchScore: { select: { score: true } },
          artistProfile: {
            select: {
              stageName: true,
              user: { select: { id: true, email: true } },
            },
          },
          externalTalent: { select: { id: true } },
        },
      },
    },
  });
  if (!p) return null;
  const owner =
    p.createdBy?.user ?? p.organization.memberships[0]?.user ?? null;
  return {
    ...p,
    role: parseJson(RoleSpec, p.roleSpec),
    owner,
    statusCounts: p.candidatures.reduce<Record<string, number>>(
      (acc, c) => ((acc[c.status] = (acc[c.status] ?? 0) + 1), acc),
      {},
    ),
  };
}
