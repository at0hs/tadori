import { z } from "zod";

// ロール（requirements.md 3章、D-33）。システム全体で共通、複数付与可。
export const ROLES = ["admin", "author", "executor", "approver", "viewer"] as const;

export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;
