import { z } from "zod";

const name = z.string().trim().min(1, "Name is required").max(100, "Name must be at most 100 characters");
const description = z.string().trim().max(2000, "Description must be at most 2000 characters");

export const createProjectSchema = z.object({
  name,
  description: description.nullable().optional(),
});

export const updateProjectSchema = z
  .object({
    name: name.optional(),
    description: description.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field to update" });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
