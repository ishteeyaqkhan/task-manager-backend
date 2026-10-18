import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

export const api = request(app);

export async function resetDatabase() {
  const dbName = new URL(process.env.DATABASE_URL ?? "").pathname;
  if (!dbName.endsWith("_test")) {
    throw new Error(`Refusing to reset non-test database "${dbName}"`);
  }
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Task", "ProjectMember", "Project", "User" RESTART IDENTITY CASCADE',
  );
}

let userCounter = 0;

export async function registerUser(overrides: Partial<{ name: string; email: string; password: string }> = {}) {
  userCounter += 1;
  const body = {
    name: `User ${userCounter}`,
    email: `user${userCounter}-${Date.now()}@example.com`,
    password: "Password123",
    ...overrides,
  };
  const res = await api.post("/api/auth/register").send(body);
  if (res.status !== 201) {
    throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { ...res.body.data, password: body.password } as {
    user: { id: string; name: string; email: string };
    token: string;
    password: string;
  };
}

export function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** The "Personal" project created for every user on signup. */
export async function getPersonalProjectId(userId: string): Promise<string> {
  const membership = await prisma.projectMember.findFirstOrThrow({
    where: { userId, project: { name: "Personal" } },
  });
  return membership.projectId;
}

/** Adds a user to a project directly (the members API arrives in Phase 2). */
export async function addMemberDirectly(projectId: string, userId: string, role: "OWNER" | "MEMBER" = "MEMBER") {
  await prisma.projectMember.create({ data: { projectId, userId, role } });
}
