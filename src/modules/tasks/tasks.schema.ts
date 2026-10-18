import { Priority, TaskStatus } from "@prisma/client";
import { z } from "zod";

/** Treats empty query-string values (e.g. `?priority=`) as absent. */
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const title = z.string().trim().min(1, "Title is required").max(200, "Title must be at most 200 characters");
const description = z.string().trim().max(2000, "Description must be at most 2000 characters");
const dueDate = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })], { error: "Due date must be an ISO date" })
  .transform((value) => new Date(value));
const assigneeId = z.uuid("Invalid assignee id");

export const listTasksQuerySchema = z.object({
  status: z.preprocess(emptyToUndefined, z.enum(TaskStatus).optional()),
  priority: z.preprocess(emptyToUndefined, z.enum(Priority).optional()),
  assigneeId: z.preprocess(emptyToUndefined, assigneeId.optional()),
  search: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
});

export const createTaskSchema = z.object({
  title,
  description: description.nullable().optional(),
  status: z.enum(TaskStatus).optional(),
  priority: z.enum(Priority).optional(),
  dueDate: dueDate.nullable().optional(),
  assigneeId: assigneeId.nullable().optional(),
});

export const updateTaskSchema = createTaskSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field to update" });

export const moveTaskSchema = z.object({
  status: z.enum(TaskStatus),
  position: z.number().finite("Position must be a finite number"),
});

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
