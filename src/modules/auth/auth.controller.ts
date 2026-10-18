import type { Request, Response } from "express";
import { getAuthUser } from "../../middleware/auth.js";
import * as authService from "./auth.service.js";

export async function register(req: Request, res: Response) {
  const result = await authService.register(req.body);
  res.status(201).json({ data: result });
}

export async function login(req: Request, res: Response) {
  const result = await authService.login(req.body);
  res.json({ data: result });
}

export async function me(req: Request, res: Response) {
  const user = await authService.getMe(getAuthUser(req).id);
  res.json({ data: user });
}
