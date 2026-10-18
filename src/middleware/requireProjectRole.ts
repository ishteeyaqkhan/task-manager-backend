import type { Role } from "@prisma/client";
import type { RequestHandler } from "express";
import { assertProjectAccess } from "../modules/projects/projects.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getAuthUser } from "./auth.js";

/**
 * Ensures the current user is a member of `req.params.projectId`.
 * Pass `Role.OWNER` to additionally require the OWNER role.
 * On success, sets `req.membership`.
 */
export function requireProjectRole(requiredRole?: Role): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const projectId = String(req.params.projectId);
    req.membership = await assertProjectAccess(projectId, getAuthUser(req).id, requiredRole);
    next();
  });
}
