import type { Request, RequestHandler } from "express";
import type { AuthUser } from "../types/express.js";
import { ApiError } from "../utils/ApiError.js";
import { verifyToken } from "../utils/jwt.js";

export const auth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : undefined;

  const user = token ? verifyToken(token) : null;
  if (!user) {
    throw new ApiError(401, "Authentication required");
  }

  req.user = user;
  next();
};

/** Returns the authenticated user; for controllers behind the `auth` middleware. */
export function getAuthUser(req: Request): AuthUser {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }
  return req.user;
}
