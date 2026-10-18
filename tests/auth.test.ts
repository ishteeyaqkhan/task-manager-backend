import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { api, registerUser, resetDatabase } from "./helpers.js";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe("POST /api/auth/register", () => {
  it("creates a user and returns a token without the password hash", async () => {
    const res = await api
      .post("/api/auth/register")
      .send({ name: "Alice", email: "  Alice@Example.com ", password: "Password123" });

    expect(res.status).toBe(201);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({ name: "Alice", email: "alice@example.com" });
    expect(res.body.data.user).not.toHaveProperty("passwordHash");
  });

  it("creates a Personal project with an OWNER membership", async () => {
    const { user } = await registerUser();

    const memberships = await prisma.projectMember.findMany({
      where: { userId: user.id },
      include: { project: true },
    });

    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe("OWNER");
    expect(memberships[0]?.project.name).toBe("Personal");
  });

  it("returns 409 for a duplicate email (case-insensitive)", async () => {
    await registerUser({ email: "dup@example.com" });

    const res = await api
      .post("/api/auth/register")
      .send({ name: "Dup", email: "DUP@example.com", password: "Password123" });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toEqual(expect.any(String));
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.project.count()).toBe(1);
  });

  it.each([
    ["invalid email", { name: "Bob", email: "not-an-email", password: "Password123" }, "email"],
    ["short password", { name: "Bob", email: "bob@example.com", password: "short" }, "password"],
    ["missing name", { email: "bob@example.com", password: "Password123" }, "name"],
  ])("returns 400 for %s", async (_label, body, field) => {
    const res = await api.post("/api/auth/register").send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Validation failed");
    expect(res.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: field })]));
    expect(await prisma.user.count()).toBe(0);
  });
});

describe("POST /api/auth/login", () => {
  it("returns a token for valid credentials", async () => {
    const { user, password } = await registerUser();

    const res = await api.post("/api/auth/login").send({ email: user.email.toUpperCase(), password });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({ id: user.id, email: user.email });
    expect(res.body.data.user).not.toHaveProperty("passwordHash");
  });

  it("returns 401 for a wrong password", async () => {
    const { user } = await registerUser();

    const res = await api.post("/api/auth/login").send({ email: user.email, password: "WrongPassword1" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid email or password");
  });

  it("returns 401 for an unknown email", async () => {
    const res = await api.post("/api/auth/login").send({ email: "ghost@example.com", password: "Password123" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid email or password");
  });
});

describe("GET /api/auth/me", () => {
  it("returns the current user for a valid token", async () => {
    const { user, token } = await registerUser();

    const res = await api.get("/api/auth/me").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: user.id, email: user.email, name: user.name });
    expect(res.body.data).not.toHaveProperty("passwordHash");
  });

  it("returns 401 without a token", async () => {
    const res = await api.get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 for an invalid token", async () => {
    const res = await api.get("/api/auth/me").set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });
});
