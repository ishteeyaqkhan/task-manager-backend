import { z } from "zod";

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Invalid email address")),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;
