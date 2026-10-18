import type { Request, Response } from "express";
import { getAuthUser } from "../../middleware/auth.js";
import { getMembership } from "../projects/projects.controller.js";
import type { ListTasksQuery } from "./tasks.schema.js";
import * as tasksService from "./tasks.service.js";

function getTaskId(req: Request): string {
  return String(req.params.taskId);
}

export async function list(req: Request, res: Response) {
  // `validate` replaces req.query with the parsed listTasksQuerySchema output.
  const tasks = await tasksService.listTasks(getMembership(req).projectId, req.query as ListTasksQuery);
  res.json({ data: tasks });
}

export async function create(req: Request, res: Response) {
  const task = await tasksService.createTask(getMembership(req).projectId, getAuthUser(req).id, req.body);
  res.status(201).json({ data: task });
}

export async function update(req: Request, res: Response) {
  const task = await tasksService.updateTask(getTaskId(req), getAuthUser(req).id, req.body);
  res.json({ data: task });
}

export async function move(req: Request, res: Response) {
  const task = await tasksService.moveTask(getTaskId(req), getAuthUser(req).id, req.body);
  res.json({ data: task });
}

export async function remove(req: Request, res: Response) {
  const taskId = getTaskId(req);
  await tasksService.deleteTask(taskId, getAuthUser(req).id);
  res.json({ data: { id: taskId } });
}
