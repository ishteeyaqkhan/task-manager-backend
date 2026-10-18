import { Role } from "@prisma/client";
import { Router } from "express";
import { requireProjectRole } from "../../middleware/requireProjectRole.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as membersController from "./members.controller.js";
import { addMemberSchema } from "./members.schema.js";

/** Mounted at /api/projects/:projectId/members, behind auth. */
export const membersRouter = Router({ mergeParams: true });

membersRouter.get("/", requireProjectRole(), asyncHandler(membersController.list));
membersRouter.post(
  "/",
  requireProjectRole(Role.OWNER),
  validate({ body: addMemberSchema }),
  asyncHandler(membersController.add),
);
membersRouter.delete("/:userId", requireProjectRole(Role.OWNER), asyncHandler(membersController.remove));
