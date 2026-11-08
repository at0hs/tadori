import type { AdminUser } from "@tadori/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Search, UserSearch, X } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/empty-state.tsx";
import { ErrorBanner } from "@/components/error-banner.tsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE_LABELS } from "@/lib/roles.ts";
import { cn } from "@/lib/utils";
import { countByStatus, filterUsers, type UserStatusFilter } from "./filter.ts";
import { usersQueryOptions } from "./queries.ts";
import { UserAvatar, UserStatus } from "./user-status.tsx";

const CARDS: { status: UserStatusFilter; label: string; tone?: string }[] = [
  { status: "active", label: "有効" },
  { status: "must-change", label: "パスワードの変更が必要", tone: "text-warning" },
  { status: "banned", label: "無効", tone: "text-muted-foreground" },
  { status: "all", label: "すべて" },
];

type Filter = { status: UserStatusFilter; q: string };

// S-13 の中身（ui.md 6章）。絞り込みは URL の検索条件に持つ（D-12）。
export function UserList({
  filter,
  onFilterChange,
}: {
  filter: Filter;
  onFilterChange: (next: Partial<Filter>) => void;
}) {
  const { data: users, error, isPending } = useQuery(usersQueryOptions);
  const counts = users ? countByStatus(users) : undefined;
  const shown = users ? filterUsers(users, filter) : [];
  const [q, setQ] = useState(filter.q);
  // URL が外から変わったとき（メニューから開き直したときなど）は、欄を合わせる
  useEffect(() => setQ(filter.q), [filter.q]);

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

      <div className="mt-5 flex items-center gap-2">
        <div className="relative w-72">
          <Search
            className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            aria-label="名前・ユーザー名で絞り込み"
            placeholder="名前・ユーザー名で絞り込み"
            className="pl-8"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              onFilterChange({ q: e.target.value });
            }}
          />
        </div>
        {users && (
          <span className="ml-auto text-sm text-muted-foreground">
            <b className="text-base text-foreground tabular-nums">{shown.length}</b> 人
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
            <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="flex w-64 gap-1">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <div className="w-40">
                <Skeleton className="h-3 w-12" />
              </div>
              <span className="w-6" />
            </div>
          ))}
        </ListFrame>
      ) : shown.length === 0 ? (
        <div className="mt-3 rounded-xl border bg-card">
          <EmptyState
            icon={UserSearch}
            title={
              filter.q.trim()
                ? `「${filter.q.trim()}」に合うユーザーはいません`
                : "該当するユーザーはいません"
            }
            description={filter.q.trim() ? "名前の一部や、ユーザー名でも探せます" : undefined}
            action={
              filter.q.trim() && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setQ("");
                    onFilterChange({ q: "" });
                  }}
                >
                  <X aria-hidden />
                  絞り込みを解除
                </Button>
              )
            }
          />
        </div>
      ) : (
        <ListFrame>
          {shown.map((user) => (
            <UserRow key={user.id} user={user} />
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
        <span className="flex-1">名前</span>
        <span className="w-64">ロール</span>
        <span className="w-40">状態</span>
        <span className="w-6" />
      </div>
      {children}
    </div>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  return (
    <Link
      to="/admin/users/$userId"
      params={{ userId: user.id }}
      className="flex items-center gap-4 border-b px-4 py-2.5 transition-colors last:border-0 hover:bg-accent/50"
    >
      <UserAvatar name={user.name} />
      <div className="min-w-0 flex-1">
        <div className={cn("truncate font-semibold", user.banned && "text-muted-foreground")}>
          {user.name}
        </div>
        <div className="truncate text-xs text-muted-foreground">{user.username}</div>
      </div>
      <div className="flex w-64 flex-wrap gap-1">
        <Badge variant="outline">{ROLE_LABELS[user.role]}</Badge>
      </div>
      <div className="w-40">
        <UserStatus user={user} />
      </div>
      <ChevronRight className="size-4 w-6 text-muted-foreground" aria-hidden />
    </Link>
  );
}
