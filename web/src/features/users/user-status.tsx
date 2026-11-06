import type { AdminUser } from "@tadori/shared";
import { cn } from "@/lib/utils";

// 状態の表示（ui.md 4章）：色の点と文字。
export function UserStatus({ user, className }: { user: AdminUser; className?: string }) {
  const [label, color] = user.banned
    ? ["無効", "text-muted-foreground"]
    : user.mustChangePassword
      ? ["パスワードの変更が必要", "text-warning"]
      : ["有効", "text-success"];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", color, className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}

/** 頭文字の丸 */
export function UserAvatar({ name, size = "default" }: { name: string; size?: "default" | "lg" }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-accent font-semibold text-accent-foreground",
        size === "lg" ? "size-12 text-lg" : "size-9 text-sm",
      )}
      aria-hidden
    >
      {name.slice(0, 1)}
    </span>
  );
}
