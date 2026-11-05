import { z } from "zod";
import { roleSchema } from "./roles.ts";

// GET /api/me の応答（api.md）
export const meResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  username: z.string(),
  roles: z.array(roleSchema),
  mustChangePassword: z.boolean(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
