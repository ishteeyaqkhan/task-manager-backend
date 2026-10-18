import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/ApiError.js";
import type { AddMemberInput } from "./members.schema.js";

const memberSelect = {
  userId: true,
  role: true,
  joinedAt: true,
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ProjectMemberSelect;

export async function listMembers(projectId: string) {
  return prisma.projectMember.findMany({
    where: { projectId },
    select: memberSelect,
    // Enum order puts OWNER before MEMBER.
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
  });
}

/** Adds an already-registered user (looked up by email) as a MEMBER. */
export async function addMember(projectId: string, input: AddMemberInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (!user) {
    throw new ApiError(404, "No registered user found with that email");
  }

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  if (existing) {
    throw new ApiError(409, "This user is already a member of the project");
  }

  return prisma.projectMember.create({
    data: { projectId, userId: user.id, role: Role.MEMBER },
    select: memberSelect,
  });
}

/**
 * Removes a member. The last OWNER cannot be removed. The removed user's tasks in this
 * project are unassigned, since an assignee must be a project member.
 * Serializable isolation stops two owners from removing each other at the same time.
 */
export async function removeMember(projectId: string, userId: string) {
  await prisma.$transaction(
    async (tx) => {
      const member = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
        select: { role: true },
      });
      if (!member) {
        throw new ApiError(404, "Member not found in this project");
      }

      if (member.role === Role.OWNER) {
        const owners = await tx.projectMember.count({ where: { projectId, role: Role.OWNER } });
        if (owners <= 1) {
          throw new ApiError(409, "Cannot remove the last owner of the project");
        }
      }

      await tx.task.updateMany({ where: { projectId, assigneeId: userId }, data: { assigneeId: null } });
      await tx.projectMember.delete({ where: { projectId_userId: { projectId, userId } } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
