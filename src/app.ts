import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { projectsRouter } from "./modules/projects/projects.routes.js";
import { tasksRouter } from "./modules/tasks/tasks.routes.js";

export const app = express();

app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()) }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ data: { status: "ok", timestamp: new Date().toISOString() } });
});

app.use("/api/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/tasks", tasksRouter);

app.use(notFoundHandler);
app.use(errorHandler);
