import { Router } from "express";
import { auth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as tasksController from "./tasks.controller.js";
import { createTaskSchema, listTasksQuerySchema, moveTaskSchema, updateTaskSchema } from "./tasks.schema.js";

/** Mounted at /api/projects/:projectId/tasks, behind auth + requireProjectRole. */
export const projectTasksRouter = Router({ mergeParams: true });

projectTasksRouter.get("/", validate({ query: listTasksQuerySchema }), asyncHandler(tasksController.list));
projectTasksRouter.post("/", validate({ body: createTaskSchema }), asyncHandler(tasksController.create));

/** Mounted at /api/tasks. Project access is derived from the task in the service. */
export const tasksRouter = Router();

tasksRouter.use(auth);

tasksRouter.patch("/:taskId", validate({ body: updateTaskSchema }), asyncHandler(tasksController.update));
tasksRouter.patch("/:taskId/move", validate({ body: moveTaskSchema }), asyncHandler(tasksController.move));
tasksRouter.delete("/:taskId", asyncHandler(tasksController.remove));
