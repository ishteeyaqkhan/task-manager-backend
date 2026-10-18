import type { Request, Response } from "express";
import { getMembership } from "../projects/projects.controller.js";
import * as membersService from "./members.service.js";

export async function list(req: Request, res: Response) {
  const members = await membersService.listMembers(getMembership(req).projectId);
  res.json({ data: members });
}

export async function add(req: Request, res: Response) {
  const member = await membersService.addMember(getMembership(req).projectId, req.body);
  res.status(201).json({ data: member });
}

export async function remove(req: Request, res: Response) {
  const userId = String(req.params.userId);
  await membersService.removeMember(getMembership(req).projectId, userId);
  res.json({ data: { userId } });
}
