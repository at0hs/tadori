import type { Role } from "@tadori/shared";
import { BadgeCheck, Eye, type LucideIcon, PencilLine, Shield } from "lucide-react";

// ロールの表示名・説明・アイコン（ui.md 5.4、D-64）。並びは ROLES（shared）と同じ上のロールから。
// どのロールが何をできるかの判定は shared の can を使い、ここには表示だけを置く。
export const ROLE_LABELS: Record<Role, string> = {
  admin: "管理者",
  approver: "承認者",
  worker: "作業者",
  viewer: "閲覧者",
};

/** そのロールで増えること（S-14・S-15 の選択肢の説明） */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "承認者に加えて、ユーザーの管理",
  approver: "作業者に加えて、実行の承認と手順書の公開",
  worker: "手順書を書く（下書き）、実行する",
  viewer: "手順書と実行記録を見るだけ",
};

export const ROLE_ICONS: Record<Role, LucideIcon> = {
  admin: Shield,
  approver: BadgeCheck,
  worker: PencilLine,
  viewer: Eye,
};
