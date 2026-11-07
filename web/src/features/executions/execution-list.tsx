import {
  APPROVAL_STATUSES,
  type ApprovalStatus,
  EXECUTION_STATUSES,
  type ExecutionStatus,
  type ExecutionSummary,
} from "@tadori/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowDownWideNarrow,
  BadgeCheck,
  Ban,
  ChevronDown,
  ChevronRight,
  CircleDot,
  FileText,
  Flag,
  ListChecks,
  Play,
  SearchX,
  User,
  X,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state.tsx";
import { ErrorBanner } from "@/components/error-banner.tsx";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatShortDateTime } from "@/lib/format.ts";
import { cn } from "@/lib/utils";
import { ApprovalBadge, Avatar, ExecutionStatusLabel } from "./execution-status.tsx";
import {
  EXECUTION_SORTS,
  type ExecutionFilter,
  type ExecutionListFilter,
  type ExecutionSort,
  executionCounts,
  filterExecutions,
} from "./filter.ts";
import { executionListQueryOptions } from "./queries.ts";

const CARDS: { card: ExecutionListFilter; label: string; tone?: string }[] = [
  { card: "all", label: "すべて" },
  { card: "running", label: "実行中", tone: "text-primary" },
  { card: "pending", label: "承認待ち", tone: "text-warning" },
  { card: "rejected", label: "差し戻し", tone: "text-destructive" },
];

const SORT_LABELS: Record<ExecutionSort, string> = {
  updated: "最終更新が新しい順",
  started: "開始日時が新しい順",
};

export const EXECUTION_STATUS_LABELS: Record<ExecutionStatus, string> = {
  running: "実行中",
  completed: "完了",
  abnormal: "異常終了",
  cancelled: "中止",
};

const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  pending: "承認待ち",
  approved: "承認済み",
  rejected: "差し戻し",
};

/** 一覧の中の実行から、実行者の名前を取る（ホームの「すべて見る」から来たときのチップ） */
export function executorNameOf(list: ExecutionSummary[] | undefined, userId: string) {
  return list?.find((e) => e.executor.id === userId)?.executor.name;
}

/** 一覧の中の実行から、手順書のタイトルを取る（S-05 から来たときの見出し・チップ） */
export function procedureTitleOf(list: ExecutionSummary[] | undefined, procedureId: string) {
  return list?.find((e) => e.procedure.id === procedureId)?.procedure.title;
}

// S-11 の中身（ui.md 8.3）。絞り込みは URL の検索条件に持つ（D-12）。
export function ExecutionList({
  filter,
  onFilterChange,
}: {
  filter: ExecutionFilter;
  onFilterChange: (next: Partial<ExecutionFilter>) => void;
}) {
  const { data: list, error, isPending } = useQuery(executionListQueryOptions);
  const counts = list ? executionCounts(list, filter) : undefined;
  const shown = list ? filterExecutions(list, filter) : [];
  const procedures = [
    ...new Map((list ?? []).map((e) => [e.procedure.id, e.procedure.title])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], "ja"));
  const executors = [
    ...new Map((list ?? []).map((e) => [e.executor.id, e.executor.name])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], "ja"));
  const narrowed =
    filter.card !== "all" ||
    filter.status.length > 0 ||
    filter.approval !== undefined ||
    filter.procedure !== undefined ||
    filter.executor !== undefined;
  const procedureTitle = filter.procedure && procedureTitleOf(list, filter.procedure);
  const executorName = filter.executor && executorNameOf(list, filter.executor);

  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {CARDS.map((c) => (
          <button
            key={c.card}
            type="button"
            aria-pressed={filter.card === c.card}
            onClick={() => onFilterChange({ card: c.card })}
            className={cn(
              "flex flex-col items-start rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:border-ring active:scale-[.98]",
              filter.card === c.card && "border-primary bg-accent/60 ring-1 ring-primary",
            )}
          >
            <span className="text-xs text-muted-foreground">{c.label}</span>
            {counts ? (
              <span className={cn("text-3xl font-semibold tabular-nums", c.tone)}>
                {counts[c.card]}
              </span>
            ) : (
              <Skeleton className="mt-1 h-8 w-8" />
            )}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {filter.procedure ? (
          <Badge
            variant="outline"
            className="h-8 gap-1 rounded-lg border-primary/40 bg-accent px-2.5 text-sm text-accent-foreground"
          >
            <FileText aria-hidden />
            手順書：{procedureTitle ?? "この手順書"}
            <button
              type="button"
              aria-label="手順書の絞り込みを外す"
              className="ml-1 opacity-70 hover:opacity-100"
              onClick={() => onFilterChange({ procedure: undefined })}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </Badge>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              <FileText aria-hidden />
              手順書
              <ChevronDown className="text-muted-foreground" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {procedures.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">実行はまだありません</p>
              ) : (
                <DropdownMenuRadioGroup
                  value={filter.procedure ?? ""}
                  onValueChange={(v) => onFilterChange({ procedure: v as string })}
                >
                  {procedures.map(([id, title]) => (
                    <DropdownMenuRadioItem key={id} value={id}>
                      {title}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {filter.executor ? (
          <Badge
            variant="outline"
            className="h-8 gap-1 rounded-lg border-primary/40 bg-accent px-2.5 text-sm text-accent-foreground"
          >
            <User aria-hidden />
            {executorName ? `実行者：${executorName}` : "実行者"}
            <button
              type="button"
              aria-label="実行者の絞り込みを外す"
              className="ml-1 opacity-70 hover:opacity-100"
              onClick={() => onFilterChange({ executor: undefined })}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </Badge>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              <User aria-hidden />
              実行者
              <ChevronDown className="text-muted-foreground" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {executors.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">実行はまだありません</p>
              ) : (
                <DropdownMenuRadioGroup
                  value={filter.executor ?? ""}
                  onValueChange={(v) => onFilterChange({ executor: v as string })}
                >
                  {executors.map(([id, name]) => (
                    <DropdownMenuRadioItem key={id} value={id}>
                      {name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            <CircleDot aria-hidden />
            状態
            {filter.status.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {filter.status.map((s) => EXECUTION_STATUS_LABELS[s]).join("・")}
              </Badge>
            )}
            <ChevronDown className="text-muted-foreground" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {EXECUTION_STATUSES.map((s) => (
              <DropdownMenuCheckboxItem
                key={s}
                checked={filter.status.includes(s)}
                onCheckedChange={(on) =>
                  onFilterChange({
                    status: on
                      ? EXECUTION_STATUSES.filter((x) => x === s || filter.status.includes(x))
                      : filter.status.filter((x) => x !== s),
                  })
                }
              >
                {EXECUTION_STATUS_LABELS[s]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            <BadgeCheck aria-hidden />
            承認状態
            {filter.approval && (
              <Badge variant="secondary" className="ml-1">
                {APPROVAL_LABELS[filter.approval]}
              </Badge>
            )}
            <ChevronDown className="text-muted-foreground" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuRadioGroup
              value={filter.approval ?? "any"}
              onValueChange={(v) =>
                onFilterChange({ approval: v === "any" ? undefined : (v as ApprovalStatus) })
              }
            >
              <DropdownMenuRadioItem value="any">指定しない</DropdownMenuRadioItem>
              {APPROVAL_STATUSES.map((a) => (
                <DropdownMenuRadioItem key={a} value={a}>
                  {APPROVAL_LABELS[a]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" className="text-muted-foreground" />}
          >
            <ArrowDownWideNarrow aria-hidden />
            {SORT_LABELS[filter.sort]}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              value={filter.sort}
              onValueChange={(v) => onFilterChange({ sort: v as ExecutionSort })}
            >
              {EXECUTION_SORTS.map((s) => (
                <DropdownMenuRadioItem key={s} value={s}>
                  {SORT_LABELS[s]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {list && (
          <span className="ml-auto text-sm text-muted-foreground">
            <b className="text-base text-foreground tabular-nums">{shown.length}</b> 件
          </span>
        )}
      </div>

      {error ? (
        <div className="mt-3">
          <ErrorBanner error={error} />
        </div>
      ) : isPending ? (
        <ListFrame>
          {Array.from({ length: 5 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 中身のない骨組み
            <div key={i} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-0">
              <Skeleton className="size-9 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-52" />
              </div>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </ListFrame>
      ) : shown.length === 0 ? (
        <div className="mt-3 rounded-xl border bg-card">
          {narrowed && list.length > 0 ? (
            <EmptyState
              icon={SearchX}
              title="条件に合う実行はありません"
              action={
                <Button
                  variant="outline"
                  onClick={() =>
                    onFilterChange({
                      card: "all",
                      status: [],
                      approval: undefined,
                      procedure: undefined,
                      executor: undefined,
                    })
                  }
                >
                  <X aria-hidden />
                  絞り込みを解除
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={ListChecks}
              title="実行はまだありません"
              description="手順書の詳細の「実行を開始」から始めます"
              action={
                <Link to="/procedures" className={buttonVariants({ variant: "outline" })}>
                  手順書を探す
                </Link>
              }
            />
          )}
        </div>
      ) : (
        <ListFrame>
          {shown.map((e) => (
            <ExecutionRow key={e.id} execution={e} />
          ))}
        </ListFrame>
      )}
    </>
  );
}

function ListFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-4 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
        <span className="w-9" />
        <span className="flex-1">手順書</span>
        <span className="w-32">実行者</span>
        <span className="w-20">状態</span>
        <span className="w-36">進捗</span>
        <span className="w-24">承認</span>
        <span className="w-24">開始</span>
        <span className="w-24">最終更新</span>
        <span className="w-4" />
      </div>
      {children}
    </div>
  );
}

export function ProgressBar({ execution: e }: { execution: ExecutionSummary }) {
  const { done, total } = e.progress;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const color =
    e.status === "abnormal"
      ? "bg-destructive"
      : e.status === "cancelled"
        ? "bg-muted-foreground/50"
        : done === total
          ? "bg-success"
          : "bg-primary";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums">
        <b className="text-sm">{done}</b> / {total}
      </span>
    </div>
  );
}

function ExecutionRow({ execution: e }: { execution: ExecutionSummary }) {
  const Icon = e.status === "running" ? Play : e.status === "cancelled" ? Ban : Flag;
  return (
    <Link
      to="/executions/$executionId"
      params={{ executionId: e.id }}
      className="flex items-center gap-4 border-b px-4 py-3 transition-colors last:border-0 hover:bg-accent/50"
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg",
          e.status === "running"
            ? "bg-accent text-accent-foreground"
            : "bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="truncate font-semibold">{e.procedure.title}</span>{" "}
        <span className="text-xs text-muted-foreground tabular-nums">v{e.versionNo}</span>
      </div>
      <span className="flex w-32 items-center gap-1.5 truncate text-sm">
        <Avatar name={e.executor.name} />
        <span className="truncate">{e.executor.name}</span>
      </span>
      <span className="w-20">
        <ExecutionStatusLabel status={e.status} />
      </span>
      <span className="w-36">
        <ProgressBar execution={e} />
      </span>
      <span className="w-24">
        {e.approvalStatus && <ApprovalBadge status={e.approvalStatus} />}
      </span>
      <span className="w-24 text-xs text-muted-foreground tabular-nums">
        {formatShortDateTime(e.startedAt)}
      </span>
      <span className="w-24 text-xs text-muted-foreground tabular-nums">
        {formatShortDateTime(e.updatedAt)}
      </span>
      <ChevronRight className="size-4 w-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}
