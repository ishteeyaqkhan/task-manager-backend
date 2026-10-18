import "dotenv/config";
import bcrypt from "bcrypt";
import { Priority, PrismaClient, Role, TaskStatus } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@taskmanager.dev";
const DEMO_PASSWORD = "Demo@1234";
const POSITION_STEP = 1000;

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setHours(17, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

type SeedTask = {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  dueDate?: Date;
};

const tasks: SeedTask[] = [
  {
    title: "Set up project repository",
    description: "Initialize the monorepo, configure TypeScript and linting.",
    status: TaskStatus.DONE,
    priority: Priority.HIGH,
    dueDate: daysFromNow(-5),
  },
  {
    title: "Design database schema",
    description: "Model users, projects, memberships and tasks in Prisma.",
    status: TaskStatus.DONE,
    priority: Priority.MEDIUM,
    dueDate: daysFromNow(-3),
  },
  {
    title: "Write onboarding notes",
    status: TaskStatus.DONE,
    priority: Priority.LOW,
  },
  {
    title: "Build authentication flow",
    description: "Register, login and JWT-protected routes.",
    status: TaskStatus.IN_PROGRESS,
    priority: Priority.HIGH,
    dueDate: daysFromNow(1),
  },
  {
    title: "Implement Kanban drag and drop",
    description: "Use dnd-kit with optimistic updates for moving cards.",
    status: TaskStatus.IN_PROGRESS,
    priority: Priority.MEDIUM,
    dueDate: daysFromNow(4),
  },
  {
    title: "Fix overdue invoice reminder copy",
    status: TaskStatus.TODO,
    priority: Priority.HIGH,
    dueDate: daysFromNow(-1),
  },
  {
    title: "Add task filters",
    description: "Search by title and filter by priority, synced to the URL.",
    status: TaskStatus.TODO,
    priority: Priority.MEDIUM,
    dueDate: daysFromNow(7),
  },
  {
    title: "Polish empty states",
    description: "Friendly empty states for boards and project lists.",
    status: TaskStatus.TODO,
    priority: Priority.LOW,
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (existing) {
      // Tasks reference their creator with RESTRICT, so remove the demo projects (cascading tasks) first.
      await tx.project.deleteMany({ where: { members: { some: { userId: existing.id } } } });
      await tx.user.delete({ where: { id: existing.id } });
    }

    const user = await tx.user.create({
      data: { name: "Demo User", email: DEMO_EMAIL, passwordHash },
    });

    const project = await tx.project.create({
      data: {
        name: "Personal",
        description: "Your personal tasks.",
        members: { create: { userId: user.id, role: Role.OWNER } },
      },
    });

    const nextPosition: Record<TaskStatus, number> = {
      [TaskStatus.TODO]: POSITION_STEP,
      [TaskStatus.IN_PROGRESS]: POSITION_STEP,
      [TaskStatus.DONE]: POSITION_STEP,
    };

    await tx.task.createMany({
      data: tasks.map((task) => {
        const position = nextPosition[task.status];
        nextPosition[task.status] += POSITION_STEP;
        return {
          ...task,
          position,
          projectId: project.id,
          createdById: user.id,
          assigneeId: user.id,
        };
      }),
    });
  });

  console.log(`Seeded ${tasks.length} tasks for ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
