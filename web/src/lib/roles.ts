import type { Role } from "@tadori/shared";
import { BadgeCheck, Eye, type LucideIcon, PencilLine, Play, Shield } from "lucide-react";

// ロールの表示名とアイコン（ui.md 5.4）。並びは ROLES（shared）と同じ。
export const ROLE_LABELS: Record<Role, string> = {
  admin: "管理者",
  author: "作成者",
  executor: "実行者",
  approver: "承認者",
  viewer: "閲覧者",
};

export const ROLE_ICONS: Record<Role, LucideIcon> = {
  admin: Shield,
  author: PencilLine,
  executor: Play,
  approver: BadgeCheck,
  viewer: Eye,
};
