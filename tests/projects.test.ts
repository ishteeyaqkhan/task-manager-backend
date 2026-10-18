import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { addMemberDirectly, api, bearer, getPersonalProjectId, registerUser, resetDatabase } from "./helpers.js";

type TestUser = Awaited<ReturnType<typeof registerUser>>;

let owner: TestUser;

beforeEach(async () => {
  await resetDatabase();
  owner = await registerUser();
});

afterAll(() => prisma.$disconnect());

describe("projects", () => {
  it("lists only the user's projects with role and task counts", async () => {
    const projectId = await getPersonalProjectId(owner.user.id);
    await api.post(`/api/projects/${projectId}/tasks`).set(bearer(owner.token)).send({ title: "A" });
    await api.post(`/api/projects/${projectId}/tasks`).set(bearer(owner.token)).send({ title: "B", status: "DONE" });
    await registerUser(); // another user's Personal project must not appear

    const res = await api.get("/api/projects").set(bearer(owner.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: projectId,
      name: "Personal",
      role: "OWNER",
      memberCount: 1,
      taskCounts: { TODO: 1, IN_PROGRESS: 0, DONE: 1, total: 2 },
    });
  });

  it("creates a project with the creator as OWNER", async () => {
    const res = await api
      .post("/api/projects")
      .set(bearer(owner.token))
      .send({ name: "Launch", description: "Q4 launch" });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: "Launch", description: "Q4 launch", role: "OWNER" });

    const membership = await prisma.projectMember.findUniqueOrThrow({
      where: { projectId_userId: { projectId: res.body.data.id, userId: owner.user.id } },
    });
    expect(membership.role).toBe("OWNER");
  });

  it.each([
    ["omitted", {}],
    ["null", { description: null }],
    ["empty", { description: "" }],
  ])("creates a project with the description %s", async (_label, extra) => {
    const res = await api
      .post("/api/projects")
      .set(bearer(owner.token))
      .send({ name: "No description", ...extra });

    expect(res.status).toBe(201);
    expect(res.body.data.description).toBeNull();
  });

  it("returns 400 for an empty project name", async () => {
    const res = await api.post("/api/projects").set(bearer(owner.token)).send({ name: " " });
    expect(res.status).toBe(400);
  });

  it("gets, updates and deletes a project as OWNER", async () => {
    const projectId = await getPersonalProjectId(owner.user.id);

    const get = await api.get(`/api/projects/${projectId}`).set(bearer(owner.token));
    expect(get.status).toBe(200);
    expect(get.body.data).toMatchObject({ id: projectId, role: "OWNER" });

    const patch = await api.patch(`/api/projects/${projectId}`).set(bearer(owner.token)).send({ name: "Renamed" });
    expect(patch.status).toBe(200);
    expect(patch.body.data.name).toBe("Renamed");

    const del = await api.delete(`/api/projects/${projectId}`).set(bearer(owner.token));
    expect(del.status).toBe(200);
    expect(await prisma.project.findUnique({ where: { id: projectId } })).toBeNull();
  });

  it("returns 404 for a project that does not exist", async () => {
    const res = await api.get("/api/projects/00000000-0000-4000-8000-000000000000").set(bearer(owner.token));
    expect(res.status).toBe(404);
  });

  it("returns 403 for a non-member", async () => {
    const projectId = await getPersonalProjectId(owner.user.id);
    const outsider = await registerUser();

    const res = await api.get(`/api/projects/${projectId}`).set(bearer(outsider.token));
    expect(res.status).toBe(403);
  });

  it("lets a MEMBER read but not update or delete the project", async () => {
    const projectId = await getPersonalProjectId(owner.user.id);
    const member = await registerUser();
    await addMemberDirectly(projectId, member.user.id);

    const get = await api.get(`/api/projects/${projectId}`).set(bearer(member.token));
    const patch = await api.patch(`/api/projects/${projectId}`).set(bearer(member.token)).send({ name: "Mine now" });
    const del = await api.delete(`/api/projects/${projectId}`).set(bearer(member.token));

    expect(get.status).toBe(200);
    expect(get.body.data.role).toBe("MEMBER");
    expect([patch.status, del.status]).toEqual([403, 403]);
  });
});
