import { Role, TaskStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { ProjectMembership } from "../../types/express.js";
import { ApiError } from "../../utils/ApiError.js";
import type { CreateProjectInput, UpdateProjectInput } from "./projects.schema.js";

type TaskCounts = Record<TaskStatus, number> & { total: number };

function emptyCounts(): TaskCounts {
  return { TODO: 0, IN_PROGRESS: 0, DONE: 0, total: 0 };
}

async function getTaskCounts(projectIds: string[]): Promise<Map<string, TaskCounts>> {
  const groups = await prisma.task.groupBy({
    by: ["projectId", "status"],
    where: { projectId: { in: projectIds } },
    _count: { _all: true },
  });

  const counts = new Map(projectIds.map((id) => [id, emptyCounts()]));
  for (const group of groups) {
    const entry = counts.get(group.projectId);
    if (!entry) continue;
    entry[group.status] = group._count._all;
    entry.total += group._count._all;
  }
  return counts;
}

/**
 * Checks that the user is a member of the project (and OWNER if required).
 * 404 if the project does not exist, 403 if the user lacks access.
 */
export async function assertProjectAccess(
  projectId: string,
  userId: string,
  requiredRole?: Role,
): Promise<ProjectMembership> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { members: { where: { userId }, select: { role: true } } },
  });
  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  const membership = project.members[0];
  if (!membership) {
    throw new ApiError(403, "You are not a member of this project");
  }
  if (requiredRole === Role.OWNER && membership.role !== Role.OWNER) {
    throw new ApiError(403, "Only the project owner can do this");
  }
  return { projectId, role: membership.role };
}

export async function listProjects(userId: string) {
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    include: { project: { include: { _count: { select: { members: true } } } } },
    orderBy: { project: { createdAt: "asc" } },
  });

  const counts = await getTaskCounts(memberships.map((m) => m.projectId));

  return memberships.map(({ project, role }) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt,
    role,
    memberCount: project._count.members,
    taskCounts: counts.get(project.id) ?? emptyCounts(),
  }));
}

export async function createProject(userId: string, input: CreateProjectInput) {
  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: { name: input.name, description: input.description || null },
    });
    await tx.projectMember.create({
      data: { projectId: created.id, userId, role: Role.OWNER },
    });
    return created;
  });

  return { ...project, role: Role.OWNER, memberCount: 1, taskCounts: emptyCounts() };
}

export async function getProject(membership: ProjectMembership) {
  const project = await prisma.project.findUnique({
    where: { id: membership.projectId },
    include: { _count: { select: { members: true } } },
  });
  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  const counts = await getTaskCounts([project.id]);
  const { _count, ...rest } = project;
  return {
    ...rest,
    role: membership.role,
    memberCount: _count.members,
    taskCounts: counts.get(project.id) ?? emptyCounts(),
  };
}

export async function updateProject(projectId: string, input: UpdateProjectInput) {
  return prisma.project.update({
    where: { id: projectId },
    data: {
      name: input.name,
      description: input.description === undefined ? undefined : input.description || null,
    },
  });
}

export async function deleteProject(projectId: string) {
  await prisma.project.delete({ where: { id: projectId } });
}
