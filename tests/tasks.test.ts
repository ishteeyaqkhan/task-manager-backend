import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { addMemberDirectly, api, bearer, getPersonalProjectId, registerUser, resetDatabase } from "./helpers.js";

type TestUser = Awaited<ReturnType<typeof registerUser>>;

let owner: TestUser;
let projectId: string;

beforeEach(async () => {
  await resetDatabase();
  owner = await registerUser();
  projectId = await getPersonalProjectId(owner.user.id);
});

afterAll(() => prisma.$disconnect());

async function createTask(body: Record<string, unknown>, user: TestUser = owner, pid = projectId) {
  const res = await api.post(`/api/projects/${pid}/tasks`).set(bearer(user.token)).send(body);
  expect(res.status).toBe(201);
  return res.body.data as { id: string; title: string; status: string; priority: string; position: number };
}

describe("task CRUD for a member", () => {
  it("creates a task with defaults", async () => {
    const res = await api
      .post(`/api/projects/${projectId}/tasks`)
      .set(bearer(owner.token))
      .send({ title: "  Write tests  ", description: "Cover the API", dueDate: "2026-12-01" });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: "Write tests",
      description: "Cover the API",
      status: "TODO",
      priority: "MEDIUM",
      projectId,
      createdById: owner.user.id,
      assigneeId: null,
      assignee: null,
    });
    expect(new Date(res.body.data.dueDate).toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("appends new tasks to the end of their column", async () => {
    const first = await createTask({ title: "First" });
    const second = await createTask({ title: "Second" });
    const otherColumn = await createTask({ title: "Doing", status: "IN_PROGRESS" });

    expect(second.position).toBeGreaterThan(first.position);
    expect(otherColumn.position).toBe(first.position);
  });

  it("lists tasks ordered by status and position", async () => {
    await createTask({ title: "A" });
    await createTask({ title: "B" });
    await createTask({ title: "C", status: "DONE" });

    const res = await api.get(`/api/projects/${projectId}/tasks`).set(bearer(owner.token));

    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual(["A", "B", "C"]);
  });

  it("updates a task", async () => {
    const task = await createTask({ title: "Old title" });

    const res = await api
      .patch(`/api/tasks/${task.id}`)
      .set(bearer(owner.token))
      .send({ title: "New title", priority: "HIGH", description: null });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: task.id, title: "New title", priority: "HIGH", description: null });
  });

  it("moves a task to the end of the new column when status changes via update", async () => {
    await createTask({ title: "Done 1", status: "DONE" });
    const task = await createTask({ title: "Todo" });

    const res = await api.patch(`/api/tasks/${task.id}`).set(bearer(owner.token)).send({ status: "DONE" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("DONE");
    expect(res.body.data.position).toBe(2000);
  });

  it("deletes a task", async () => {
    const task = await createTask({ title: "Delete me" });

    const res = await api.delete(`/api/tasks/${task.id}`).set(bearer(owner.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: task.id });
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeNull();
  });

  it("returns 404 for a task that does not exist", async () => {
    const res = await api
      .patch("/api/tasks/00000000-0000-4000-8000-000000000000")
      .set(bearer(owner.token))
      .send({ title: "x" });
    expect(res.status).toBe(404);
  });

  it.each([
    ["empty title", { title: "   " }],
    ["title over 200 chars", { title: "x".repeat(201) }],
    ["description over 2000 chars", { title: "ok", description: "x".repeat(2001) }],
    ["invalid priority", { title: "ok", priority: "URGENT" }],
    ["invalid due date", { title: "ok", dueDate: "next tuesday" }],
  ])("returns 400 for %s", async (_label, body) => {
    const res = await api.post(`/api/projects/${projectId}/tasks`).set(bearer(owner.token)).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Validation failed");
  });

  it("returns 401 without a token", async () => {
    const res = await api.get(`/api/projects/${projectId}/tasks`);
    expect(res.status).toBe(401);
  });
});

describe("filters", () => {
  beforeEach(async () => {
    await createTask({ title: "Fix login bug", priority: "HIGH" });
    await createTask({ title: "Write docs", priority: "LOW", status: "DONE" });
    await createTask({ title: "Login page styles", priority: "MEDIUM", status: "IN_PROGRESS" });
  });

  async function titlesFor(query: string) {
    const res = await api.get(`/api/projects/${projectId}/tasks?${query}`).set(bearer(owner.token));
    expect(res.status).toBe(200);
    return (res.body.data as { title: string }[]).map((t) => t.title).sort();
  }

  it("filters by status", async () => {
    expect(await titlesFor("status=DONE")).toEqual(["Write docs"]);
  });

  it("filters by priority", async () => {
    expect(await titlesFor("priority=HIGH")).toEqual(["Fix login bug"]);
  });

  it("searches titles case-insensitively", async () => {
    expect(await titlesFor("search=LOGIN")).toEqual(["Fix login bug", "Login page styles"]);
  });

  it("filters by assignee", async () => {
    const assigned = await createTask({ title: "Mine", assigneeId: owner.user.id });
    const res = await api.get(`/api/projects/${projectId}/tasks?assigneeId=${owner.user.id}`).set(bearer(owner.token));
    expect(res.body.data.map((t: { id: string }) => t.id)).toEqual([assigned.id]);
  });

  it("combines filters and ignores empty values", async () => {
    expect(await titlesFor("search=login&priority=MEDIUM&status=")).toEqual(["Login page styles"]);
  });

  it("returns 400 for an invalid filter value", async () => {
    const res = await api.get(`/api/projects/${projectId}/tasks?status=ARCHIVED`).set(bearer(owner.token));
    expect(res.status).toBe(400);
  });
});

describe("move endpoint", () => {
  it("updates status and position of only the moved task", async () => {
    const a = await createTask({ title: "A" });
    const b = await createTask({ title: "B" });
    const done1 = await createTask({ title: "Done 1", status: "DONE" });
    const done2 = await createTask({ title: "Done 2", status: "DONE" });

    const position = (done1.position + done2.position) / 2;
    const res = await api
      .patch(`/api/tasks/${a.id}/move`)
      .set(bearer(owner.token))
      .send({ status: "DONE", position });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: a.id, status: "DONE", position });

    const doneColumn = await api.get(`/api/projects/${projectId}/tasks?status=DONE`).set(bearer(owner.token));
    expect(doneColumn.body.data.map((t: { title: string }) => t.title)).toEqual(["Done 1", "A", "Done 2"]);

    const untouched = await prisma.task.findUniqueOrThrow({ where: { id: b.id } });
    expect(untouched).toMatchObject({ status: "TODO", position: b.position });
  });

  it("reorders within a column", async () => {
    const a = await createTask({ title: "A" });
    await createTask({ title: "B" });

    await api.patch(`/api/tasks/${a.id}/move`).set(bearer(owner.token)).send({ status: "TODO", position: 3000 });

    const res = await api.get(`/api/projects/${projectId}/tasks`).set(bearer(owner.token));
    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual(["B", "A"]);
  });

  it("returns 400 when status or position is missing", async () => {
    const task = await createTask({ title: "A" });
    const res = await api.patch(`/api/tasks/${task.id}/move`).set(bearer(owner.token)).send({ status: "DONE" });
    expect(res.status).toBe(400);
  });
});

describe("assignee must be a project member", () => {
  it("allows assigning a project member", async () => {
    const member = await registerUser();
    await addMemberDirectly(projectId, member.user.id);

    const task = await createTask({ title: "Assigned", assigneeId: member.user.id });

    expect(task).toMatchObject({ assigneeId: member.user.id, assignee: { id: member.user.id, name: member.user.name } });
  });

  it("returns 400 when creating with a non-member assignee", async () => {
    const outsider = await registerUser();

    const res = await api
      .post(`/api/projects/${projectId}/tasks`)
      .set(bearer(owner.token))
      .send({ title: "Nope", assigneeId: outsider.user.id });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Assignee must be a member of this project");
  });

  it("returns 400 when updating to a non-member assignee", async () => {
    const outsider = await registerUser();
    const task = await createTask({ title: "Task" });

    const res = await api.patch(`/api/tasks/${task.id}`).set(bearer(owner.token)).send({ assigneeId: outsider.user.id });

    expect(res.status).toBe(400);
  });

  it("allows unassigning with null", async () => {
    const task = await createTask({ title: "Task", assigneeId: owner.user.id });

    const res = await api.patch(`/api/tasks/${task.id}`).set(bearer(owner.token)).send({ assigneeId: null });

    expect(res.status).toBe(200);
    expect(res.body.data.assigneeId).toBeNull();
  });
});

describe("non-member access", () => {
  let outsider: TestUser;
  let taskId: string;

  beforeEach(async () => {
    outsider = await registerUser();
    taskId = (await createTask({ title: "Private" })).id;
  });

  it("returns 403 when listing another project's tasks", async () => {
    const res = await api.get(`/api/projects/${projectId}/tasks`).set(bearer(outsider.token));
    expect(res.status).toBe(403);
  });

  it("returns 403 when creating a task in another project", async () => {
    const res = await api.post(`/api/projects/${projectId}/tasks`).set(bearer(outsider.token)).send({ title: "Sneaky" });
    expect(res.status).toBe(403);
    expect(await prisma.task.count({ where: { projectId } })).toBe(1);
  });

  it("returns 403 when updating, moving or deleting another project's task", async () => {
    const update = await api.patch(`/api/tasks/${taskId}`).set(bearer(outsider.token)).send({ title: "Hacked" });
    const move = await api
      .patch(`/api/tasks/${taskId}/move`)
      .set(bearer(outsider.token))
      .send({ status: "DONE", position: 1 });
    const remove = await api.delete(`/api/tasks/${taskId}`).set(bearer(outsider.token));

    expect([update.status, move.status, remove.status]).toEqual([403, 403, 403]);
    expect(await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
      title: "Private",
      status: "TODO",
    });
  });

  it("lets a MEMBER manage tasks in a shared project", async () => {
    await addMemberDirectly(projectId, outsider.user.id);

    const update = await api.patch(`/api/tasks/${taskId}`).set(bearer(outsider.token)).send({ title: "Shared edit" });
    const created = await api.post(`/api/projects/${projectId}/tasks`).set(bearer(outsider.token)).send({ title: "Mine" });

    expect(update.status).toBe(200);
    expect(created.status).toBe(201);
    expect(created.body.data.createdById).toBe(outsider.user.id);
  });
});
