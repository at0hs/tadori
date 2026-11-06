import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// 0件・準備中・権限なし・見つからない の表示（ui.md 4章）。アイコン・一言・次にできること。
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex animate-in flex-col items-center px-6 py-14 text-center duration-200 fade-in-0">
      <div className="grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground">
        <Icon className="size-7" aria-hidden />
      </div>
      <p className="mt-4 font-medium">{title}</p>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
