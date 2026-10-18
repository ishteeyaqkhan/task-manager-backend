import type { Request, Response } from "express";
import { getAuthUser } from "../../middleware/auth.js";
import { ApiError } from "../../utils/ApiError.js";
import * as projectsService from "./projects.service.js";

/** Returns the membership set by `requireProjectRole`. */
export function getMembership(req: Request) {
  if (!req.membership) {
    throw new ApiError(403, "Project access was not verified");
  }
  return req.membership;
}

export async function list(req: Request, res: Response) {
  const projects = await projectsService.listProjects(getAuthUser(req).id);
  res.json({ data: projects });
}

export async function create(req: Request, res: Response) {
  const project = await projectsService.createProject(getAuthUser(req).id, req.body);
  res.status(201).json({ data: project });
}

export async function getOne(req: Request, res: Response) {
  const project = await projectsService.getProject(getMembership(req));
  res.json({ data: project });
}

export async function update(req: Request, res: Response) {
  const project = await projectsService.updateProject(getMembership(req).projectId, req.body);
  res.json({ data: project });
}

export async function remove(req: Request, res: Response) {
  const { projectId } = getMembership(req);
  await projectsService.deleteProject(projectId);
  res.json({ data: { id: projectId } });
}
