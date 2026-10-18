import bcrypt from "bcrypt";
import { Role } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/ApiError.js";
import { signToken } from "../../utils/jwt.js";
import type { LoginInput, RegisterInput } from "./auth.schema.js";

const SALT_ROUNDS = 10;

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
} as const;

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ApiError(409, "An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { name: input.name, email: input.email, passwordHash },
      select: publicUserSelect,
    });
    const project = await tx.project.create({
      data: { name: "Personal", description: "Your personal tasks." },
    });
    await tx.projectMember.create({
      data: { projectId: project.id, userId: created.id, role: Role.OWNER },
    });
    return created;
  });

  return { user, token: signToken(user) };
}

export async function login(input: LoginInput) {
  const found = await prisma.user.findUnique({ where: { email: input.email } });
  const valid = found ? await bcrypt.compare(input.password, found.passwordHash) : false;
  if (!found || !valid) {
    throw new ApiError(401, "Invalid email or password");
  }

  const user = { id: found.id, name: found.name, email: found.email, createdAt: found.createdAt };
  return { user, token: signToken(user) };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
  if (!user) {
    throw new ApiError(401, "User no longer exists");
  }
  return user;
}
