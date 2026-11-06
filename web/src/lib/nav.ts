import type { Role } from "@tadori/shared";
import { BookOpen, House, ListChecks, type LucideIcon, Settings } from "lucide-react";

// メニューの項目（screens.md 2.1、ui.md 2章）。項目はここだけに書き、並べ方は AppShell が決める。
// 項目が増えてヘッダに並べきれなくなったら、AppShell だけを変えてサイドバーに移す。

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  adminOnly?: true;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { label: "ホーム", to: "/", icon: House },
  { label: "手順書", to: "/procedures", icon: BookOpen },
  { label: "実行", to: "/executions", icon: ListChecks },
  { label: "管理", to: "/admin/users", icon: Settings, adminOnly: true },
];

export function visibleNavItems(roles: readonly Role[]): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.adminOnly || roles.includes("admin"));
}
