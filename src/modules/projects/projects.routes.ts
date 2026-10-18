import { Role } from "@prisma/client";
import { Router } from "express";
import { auth } from "../../middleware/auth.js";
import { requireProjectRole } from "../../middleware/requireProjectRole.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { membersRouter } from "../members/members.routes.js";
import { projectTasksRouter } from "../tasks/tasks.routes.js";
import * as projectsController from "./projects.controller.js";
import { createProjectSchema, updateProjectSchema } from "./projects.schema.js";

export const projectsRouter = Router();

projectsRouter.use(auth);

projectsRouter.get("/", asyncHandler(projectsController.list));
projectsRouter.post("/", validate({ body: createProjectSchema }), asyncHandler(projectsController.create));

projectsRouter.get("/:projectId", requireProjectRole(), asyncHandler(projectsController.getOne));
projectsRouter.patch(
  "/:projectId",
  requireProjectRole(Role.OWNER),
  validate({ body: updateProjectSchema }),
  asyncHandler(projectsController.update),
);
projectsRouter.delete("/:projectId", requireProjectRole(Role.OWNER), asyncHandler(projectsController.remove));

projectsRouter.use("/:projectId/tasks", requireProjectRole(), projectTasksRouter);
projectsRouter.use("/:projectId/members", membersRouter);
