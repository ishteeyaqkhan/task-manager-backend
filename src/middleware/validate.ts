import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { ApiError } from "../utils/ApiError.js";

type Schemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    for (const key of ["params", "query", "body"] as const) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key]);
      if (!result.success) {
        throw new ApiError(
          400,
          "Validation failed",
          result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        );
      }

      // Express 5 exposes req.query as a getter, so redefine it to hold the parsed value.
      Object.defineProperty(req, key, { value: result.data, writable: true, configurable: true });
    }
    next();
  };
}
