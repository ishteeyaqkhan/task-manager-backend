import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { addMemberDirectly, api, bearer, getPersonalProjectId, registerUser, resetDatabase } from "./helpers.js";

type TestUser = Awaited<ReturnType<typeof registerUser>>;

let owner: TestUser;
let member: TestUser;
let outsider: TestUser;
let projectId: string;

beforeEach(async () => {
  await resetDatabase();
  owner = await registerUser({ name: "Olivia Owner" });
  member = await registerUser({ name: "Max Member" });
  outsider = await registerUser({ name: "Oscar Outsider" });
  projectId = await getPersonalProjectId(owner.user.id);
  await addMemberDirectly(projectId, member.user.id);
});

afterAll(() => prisma.$disconnect());

const membersUrl = () => `/api/projects/${projectId}/members`;

describe("GET /api/projects/:projectId/members", () => {
  it("lists members with roles, owners first, without password hashes", async () => {
    const res = await api.get(membersUrl()).set(bearer(member.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ userId: owner.user.id, role: "OWNER", user: expect.objectContaining({ name: "Olivia Owner" }) }),
      expect.objectContaining({ userId: member.user.id, role: "MEMBER", user: expect.objectContaining({ name: "Max Member" }) }),
    ]);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("returns 403 for a non-member", async () => {
    const res = await api.get(membersUrl()).set(bearer(outsider.token));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/projects/:projectId/members", () => {
  it("lets the OWNER add an existing user by email (case-insensitive) as MEMBER", async () => {
    const res = await api
      .post(membersUrl())
      .set(bearer(owner.token))
      .send({ email: `  ${outsider.user.email.toUpperCase()} ` });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ userId: outsider.user.id, role: "MEMBER", user: { email: outsider.user.email } });

    const projects = await api.get("/api/projects").set(bearer(outsider.token));
    expect(projects.body.data.map((p: { id: string }) => p.id)).toContain(projectId);
  });

  it("returns 403 when a MEMBER tries to add someone", async () => {
    const res = await api.post(membersUrl()).set(bearer(member.token)).send({ email: outsider.user.email });

    expect(res.status).toBe(403);
    expect(await prisma.projectMember.count({ where: { projectId } })).toBe(2);
  });

  it("returns 403 when a non-member tries to add someone", async () => {
    const res = await api.post(membersUrl()).set(bearer(outsider.token)).send({ email: outsider.user.email });
    expect(res.status).toBe(403);
  });

  it("returns 404 when no user has that email", async () => {
    const res = await api.post(membersUrl()).set(bearer(owner.token)).send({ email: "nobody@example.com" });
    expect(res.status).toBe(404);
  });

  it("returns 409 when the user is already a member", async () => {
    const res = await api.post(membersUrl()).set(bearer(owner.token)).send({ email: member.user.email });
    expect(res.status).toBe(409);
  });

  it("returns 400 for an invalid email", async () => {
    const res = await api.post(membersUrl()).set(bearer(owner.token)).send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/projects/:projectId/members/:userId", () => {
  it("lets the OWNER remove a member, who then loses access", async () => {
    const res = await api.delete(`${membersUrl()}/${member.user.id}`).set(bearer(owner.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ userId: member.user.id });

    const access = await api.get(`/api/projects/${projectId}/tasks`).set(bearer(member.token));
    expect(access.status).toBe(403);
  });

  it("returns 403 when a MEMBER tries to remove someone", async () => {
    const res = await api.delete(`${membersUrl()}/${owner.user.id}`).set(bearer(member.token));

    expect(res.status).toBe(403);
    expect(await prisma.projectMember.count({ where: { projectId } })).toBe(2);
  });

  it("returns 403 when a MEMBER tries to remove themselves", async () => {
    const res = await api.delete(`${membersUrl()}/${member.user.id}`).set(bearer(member.token));
    expect(res.status).toBe(403);
  });

  it("does not allow removing the last OWNER", async () => {
    const res = await api.delete(`${membersUrl()}/${owner.user.id}`).set(bearer(owner.token));

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe("Cannot remove the last owner of the project");
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: owner.user.id } },
    });
    expect(membership?.role).toBe("OWNER");
  });

  it("allows removing an OWNER when another OWNER remains", async () => {
    await addMemberDirectly(projectId, outsider.user.id, "OWNER");

    const res = await api.delete(`${membersUrl()}/${owner.user.id}`).set(bearer(outsider.token));

    expect(res.status).toBe(200);
    expect(await prisma.projectMember.count({ where: { projectId, role: "OWNER" } })).toBe(1);
  });

  it("returns 404 when the user is not a member", async () => {
    const res = await api.delete(`${membersUrl()}/${outsider.user.id}`).set(bearer(owner.token));
    expect(res.status).toBe(404);
  });

  it("unassigns the removed member's tasks in the project", async () => {
    const created = await api
      .post(`/api/projects/${projectId}/tasks`)
      .set(bearer(owner.token))
      .send({ title: "Assigned to Max", assigneeId: member.user.id });
    expect(created.status).toBe(201);

    await api.delete(`${membersUrl()}/${member.user.id}`).set(bearer(owner.token));

    const task = await prisma.task.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(task.assigneeId).toBeNull();
  });
});

describe("assignee must be a project member (via the members API)", () => {
  it("allows assigning a user once they are added, and rejects them after removal", async () => {
    const tasksUrl = `/api/projects/${projectId}/tasks`;

    const before = await api.post(tasksUrl).set(bearer(owner.token)).send({ title: "Early", assigneeId: outsider.user.id });
    expect(before.status).toBe(400);

    await api.post(membersUrl()).set(bearer(owner.token)).send({ email: outsider.user.email });
    const assigned = await api.post(tasksUrl).set(bearer(owner.token)).send({ title: "Now", assigneeId: outsider.user.id });
    expect(assigned.status).toBe(201);
    expect(assigned.body.data.assignee).toMatchObject({ id: outsider.user.id, name: "Oscar Outsider" });

    await api.delete(`${membersUrl()}/${outsider.user.id}`).set(bearer(owner.token));
    const reassign = await api
      .patch(`/api/tasks/${assigned.body.data.id}`)
      .set(bearer(owner.token))
      .send({ assigneeId: outsider.user.id });
    expect(reassign.status).toBe(400);
    expect(reassign.body.error.message).toBe("Assignee must be a member of this project");
  });
});
