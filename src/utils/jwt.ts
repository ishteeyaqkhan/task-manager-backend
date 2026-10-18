import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";
import type { AuthUser } from "../types/express.js";

export function signToken(user: AuthUser): string {
  return jwt.sign({ email: user.email }, env.JWT_SECRET, {
    subject: user.id,
    // env validation guarantees a non-empty string; jsonwebtoken narrows it to the `ms` format type.
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (typeof payload === "string" || !payload.sub || typeof payload.email !== "string") {
      return null;
    }
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
