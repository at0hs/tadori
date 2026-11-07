import type { ApprovalStatus, ExecutionStatus, StepStatus } from "@tadori/shared";
import {
  BadgeCheck,
  CircleCheck,
  CircleDashed,
  CircleX,
  Hourglass,
  type LucideIcon,
  SkipForward,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// 実行・ステップ・承認の状態の表示（ui.md 8章）。

export const STEP_STATUS_META: Record<
  StepStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  pending: { label: "未実施", icon: CircleDashed, className: "text-muted-foreground" },
  done: { label: "完了", icon: CircleCheck, className: "text-success" },
  skipped: { label: "スキップ", icon: SkipForward, className: "text-muted-foreground" },
  failed: { label: "失敗", icon: CircleX, className: "text-destructive" },
};

const EXECUTION_STATUS_META: Record<ExecutionStatus, { label: string; className: string }> = {
  running: { label: "実行中", className: "text-primary" },
  completed: { label: "完了", className: "text-success" },
  abnormal: { label: "異常終了", className: "text-destructive" },
  cancelled: { label: "中止", className: "text-muted-foreground" },
};

export function ExecutionStatusLabel({ status }: { status: ExecutionStatus }) {
  const meta = EXECUTION_STATUS_META[status];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs whitespace-nowrap", meta.className)}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {meta.label}
    </span>
  );
}

const APPROVAL_META: Record<
  ApprovalStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  pending: { label: "承認待ち", icon: Hourglass, className: "border-warning/40 text-warning" },
  approved: { label: "承認済み", icon: BadgeCheck, className: "border-success/40 text-success" },
  rejected: { label: "差し戻し", icon: Undo2, className: "border-destructive/40 text-destructive" },
};

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const meta = APPROVAL_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={meta.className}>
      <Icon aria-hidden />
      {meta.label}
    </Badge>
  );
}

export function StepStatusText({ status }: { status: StepStatus }) {
  const meta = STEP_STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={cn("flex shrink-0 items-center gap-1.5 text-sm font-medium", meta.className)}>
      <Icon className="size-4" aria-hidden />
      {meta.label}
    </span>
  );
}

/** ユーザーの頭文字の丸 */
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground",
        className,
      )}
      aria-hidden
    >
      {name.slice(0, 1)}
    </span>
  );
}
