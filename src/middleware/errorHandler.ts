import type { ErrorRequestHandler, RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { message: err.message, ...(err.details !== undefined && { details: err.details }) },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: { message: "Validation failed", details: err.issues } });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({ error: { message: "Resource already exists" } });
      return;
    }
    if (err.code === "P2034") {
      // Serializable transaction write conflict
      res.status(409).json({ error: { message: "The request conflicted with another change. Please retry." } });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ error: { message: "Resource not found" } });
      return;
    }
  }

  // Malformed JSON body from express.json()
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: { message: "Invalid JSON body" } });
    return;
  }

  if (env.NODE_ENV !== "test") {
    console.error(err);
  }
  res.status(500).json({ error: { message: "Internal server error" } });
};
