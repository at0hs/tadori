import { z } from "zod";

// GET /api/version の応答（api.md 4.7、D-69）。commit は短い SHA。分からなければ "unknown"
export const versionResponseSchema = z.object({
  version: z.string(),
  commit: z.string(),
});
export type VersionResponse = z.infer<typeof versionResponseSchema>;
