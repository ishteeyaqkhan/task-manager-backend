import { type Prisma, TaskStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/ApiError.js";
import { assertProjectAccess } from "../projects/projects.service.js";
import type { CreateTaskInput, ListTasksQuery, MoveTaskInput, UpdateTaskInput } from "./tasks.schema.js";

const POSITION_STEP = 1000;

const taskInclude = {
  assignee: { select: { id: true, name: true, email: true } },
} satisfies Prisma.TaskInclude;

async function assertAssigneeIsMember(projectId: string, assigneeId: string | null | undefined) {
  if (!assigneeId) return;
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: assigneeId } },
  });
  if (!member) {
    throw new ApiError(400, "Assignee must be a member of this project");
  }
}

/** Position for a task appended to the end of a column. */
async function endOfColumnPosition(projectId: string, status: TaskStatus): Promise<number> {
  const last = await prisma.task.findFirst({
    where: { projectId, status },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return last ? last.position + POSITION_STEP : POSITION_STEP;
}

/** Loads a task and verifies the user is a member of its project (404 / 403). */
async function getAccessibleTask(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, status: true },
  });
  if (!task) {
    throw new ApiError(404, "Task not found");
  }
  await assertProjectAccess(task.projectId, userId);
  return task;
}

export async function listTasks(projectId: string, query: ListTasksQuery) {
  return prisma.task.findMany({
    where: {
      projectId,
      status: query.status,
      priority: query.priority,
      assigneeId: query.assigneeId,
      title: query.search ? { contains: query.search, mode: "insensitive" } : undefined,
    },
    include: taskInclude,
    orderBy: [{ status: "asc" }, { position: "asc" }],
  });
}

export async function createTask(projectId: string, userId: string, input: CreateTaskInput) {
  await assertAssigneeIsMember(projectId, input.assigneeId);

  const status = input.status ?? TaskStatus.TODO;
  return prisma.task.create({
    data: {
      title: input.title,
      description: input.description || null,
      status,
      priority: input.priority,
      dueDate: input.dueDate ?? null,
      assigneeId: input.assigneeId ?? null,
      position: await endOfColumnPosition(projectId, status),
      projectId,
      createdById: userId,
    },
    include: taskInclude,
  });
}

export async function updateTask(taskId: string, userId: string, input: UpdateTaskInput) {
  const task = await getAccessibleTask(taskId, userId);
  await assertAssigneeIsMember(task.projectId, input.assigneeId);

  // Changing status from the edit form moves the card to the end of its new column.
  const newStatus = input.status !== undefined && input.status !== task.status ? input.status : undefined;

  return prisma.task.update({
    where: { id: taskId },
    data: {
      title: input.title,
      description: input.description === undefined ? undefined : input.description || null,
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate,
      assigneeId: input.assigneeId,
      position: newStatus ? await endOfColumnPosition(task.projectId, newStatus) : undefined,
    },
    include: taskInclude,
  });
}

/** Only the moved row is updated; the client computes the new Float position. */
export async function moveTask(taskId: string, userId: string, input: MoveTaskInput) {
  await getAccessibleTask(taskId, userId);

  return prisma.task.update({
    where: { id: taskId },
    data: { status: input.status, position: input.position },
    include: taskInclude,
  });
}

export async function deleteTask(taskId: string, userId: string) {
  await getAccessibleTask(taskId, userId);
  await prisma.task.delete({ where: { id: taskId } });
}
