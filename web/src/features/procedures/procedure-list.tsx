import type { ProcedureSummary } from "@tadori/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowDownWideNarrow,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FilePenLine,
  FileSearch,
  FileText,
  Search,
  Tag,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatShortDateTime } from "@/lib/format.ts";
import { cn } from "@/lib/utils";
import {
  filterProcedures,
  PROCEDURE_SORTS,
  type ProcedureFilter,
  type ProcedureSort,
  type ProcedureStatusFilter,
  procedureCounts,
} from "./filter.ts";
import { ProcedureStatusLabel } from "./procedure-status.tsx";
import { procedureListQueryOptions } from "./queries.ts";

const CARDS: { status: ProcedureStatusFilter; label: string; tone?: string }[] = [
  { status: "all", label: "すべて（アーカイブを除く）" },
  { status: "editing", label: "編集中", tone: "text-warning" },
  { status: "unpublished", label: "未公開", tone: "text-muted-foreground" },
  { status: "archived", label: "アーカイブ", tone: "text-muted-foreground" },
];

const SORT_LABELS: Record<ProcedureSort, string> = {
  published: "最終公開日時が新しい順",
  title: "タイトル順",
};

// S-04 の中身（ui.md 7.2）。絞り込みは URL の検索条件に持つ（D-12）。
// 未公開の手順書は API が作成者にだけ返すので、ここでは出し分けない（D-34）。
export function ProcedureList({
  filter,
  onFilterChange,
  canCreate,
}: {
  filter: ProcedureFilter;
  onFilterChange: (next: Partial<ProcedureFilter>) => void;
  canCreate: boolean;
}) {
  const { data: list, error, isPending } = useQuery(procedureListQueryOptions);
  const counts = list ? procedureCounts(list) : undefined;
  const shown = list ? filterProcedures(list, filter) : [];
  const allTags = [...new Set((list ?? []).flatMap((p) => p.tags))].sort((a, b) =>
    a.localeCompare(b, "ja"),
  );
  const [q, setQ] = useState(filter.q);
  useEffect(() => setQ(filter.q), [filter.q]);
  const filtered = filter.q.trim() !== "" || filter.tags.length > 0;

  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {CARDS.map((card) => (
          <button
            key={card.status}
            type="button"
            aria-pressed={filter.status === card.status}
            onClick={() => onFilterChange({ status: card.status })}
            className={cn(
              "flex flex-col items-start rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:border-ring active:scale-[.98]",
              filter.status === card.status && "border-primary bg-accent/60 ring-1 ring-primary",
            )}
          >
            <span className="text-xs text-muted-foreground">{card.label}</span>
            {counts ? (
              <span className={cn("text-3xl font-semibold tabular-nums", card.tone)}>
                {counts[card.status]}
              </span>
            ) : (
              <Skeleton className="mt-1 h-8 w-8" />
            )}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative w-72">
          <Search
            className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            aria-label="タイトルで絞り込み"
            placeholder="タイトルで絞り込み"
            className="pl-8"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              onFilterChange({ q: e.target.value });
            }}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            <Tag aria-hidden />
            タグ
            {filter.tags.map((t) => (
              <Badge
                key={t}
                variant="outline"
                className="border-primary/40 bg-accent text-accent-foreground"
              >
                {t}
              </Badge>
            ))}
            <ChevronDown className="text-muted-foreground" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {allTags.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">タグはまだありません</p>
            ) : (
              allTags.map((t) => (
                <DropdownMenuCheckboxItem
                  key={t}
                  checked={filter.tags.includes(t)}
                  onCheckedChange={(on) =>
                    onFilterChange({
                      tags: on ? [...filter.tags, t] : filter.tags.filter((x) => x !== t),
                    })
                  }
                >
                  {t}
                </DropdownMenuCheckboxItem>
              ))
            )}
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
              onValueChange={(v) => onFilterChange({ sort: v as ProcedureSort })}
            >
              {PROCEDURE_SORTS.map((s) => (
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
                <Skeleton className="h-3 w-80" />
              </div>
              <div className="flex w-56 gap-1">
                <Skeleton className="h-5 w-12 rounded-full" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
              <div className="w-44">
                <Skeleton className="h-3 w-16" />
              </div>
              <span className="w-12" />
              <div className="w-28">
                <Skeleton className="h-3 w-20" />
              </div>
              <span className="w-4" />
            </div>
          ))}
        </ListFrame>
      ) : shown.length === 0 ? (
        <div className="mt-3 rounded-xl border bg-card">
          {filtered ? (
            <EmptyState
              icon={FileSearch}
              title={`${[
                filter.q.trim() && `「${filter.q.trim()}」`,
                filter.tags.length > 0 && `タグ「${filter.tags.join("・")}」`,
              ]
                .filter(Boolean)
                .join("・")}に合う手順書はありません`}
              description="タイトルの一部で探せます。アーカイブした手順書は「アーカイブ」で見られます"
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setQ("");
                    onFilterChange({ q: "", tags: [] });
                  }}
                >
                  <X aria-hidden />
                  絞り込みを解除
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={BookOpen}
              title="該当する手順書はありません"
              action={
                canCreate &&
                filter.status === "all" && (
                  <Link to="/procedures/new" className={buttonVariants()}>
                    最初の手順書を作成
                  </Link>
                )
              }
            />
          )}
        </div>
      ) : (
        <ListFrame>
          {shown.map((p) => (
            <ProcedureRow key={p.id} procedure={p} />
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
        <span className="flex-1">タイトル</span>
        <span className="w-56">タグ</span>
        <span className="w-44">状態</span>
        <span className="w-12 text-right">版</span>
        <span className="w-28">最終公開</span>
        <span className="w-4" />
      </div>
      {children}
    </div>
  );
}

function ProcedureRow({ procedure: p }: { procedure: ProcedureSummary }) {
  const unpublished = p.status === "unpublished";
  const inner = (
    <>
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg",
          unpublished ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground",
        )}
        aria-hidden
      >
        {unpublished ? <FilePenLine className="size-4" /> : <FileText className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{p.title}</div>
        <div className="truncate text-xs text-muted-foreground">{p.summary || "（概要なし）"}</div>
      </div>
      <div className="flex w-56 flex-wrap gap-1">
        {p.tags.map((t) => (
          <Badge key={t} variant="outline">
            {t}
          </Badge>
        ))}
      </div>
      <div className="w-44">
        <ProcedureStatusLabel status={p.status} />
      </div>
      <div className="w-12 text-right text-sm tabular-nums">
        {p.latestVersionNo ? (
          `v${p.latestVersionNo}`
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
      <div className="w-28 text-xs text-muted-foreground tabular-nums">
        {p.lastPublishedAt ? formatShortDateTime(p.lastPublishedAt) : "—"}
      </div>
      <ChevronRight className="size-4 w-4 text-muted-foreground" aria-hidden />
    </>
  );
  const rowClass =
    "flex items-center gap-4 border-b px-4 py-3 transition-colors last:border-0 hover:bg-accent/50";
  // 未公開の手順書は編集画面へ（screens.md S-04）
  return unpublished ? (
    <Link to="/procedures/$procedureId/edit" params={{ procedureId: p.id }} className={rowClass}>
      {inner}
    </Link>
  ) : (
    <Link to="/procedures/$procedureId" params={{ procedureId: p.id }} className={rowClass}>
      {inner}
    </Link>
  );
}
