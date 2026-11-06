import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { CircleCheck, Ellipsis, KeyRound, UserX } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state.tsx";
import { ErrorBanner } from "@/components/error-banner.tsx";
import { Breadcrumbs } from "@/components/page-header.tsx";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { meQueryOptions } from "@/features/me/queries.ts";
import { isApiError } from "@/lib/api.ts";
import { BanUserDialog } from "./ban-user-dialog.tsx";
import { userQueryOptions } from "./queries.ts";
import { ResetPasswordDialog } from "./reset-password-dialog.tsx";
import { RoleSwitches } from "./role-switches.tsx";
import { UserAvatar, UserStatus } from "./user-status.tsx";

const BREADCRUMB_ROOT = { label: "ユーザー", to: "/admin/users" };

// S-15 の中身（ui.md 6章）。「実行中の実行」の区画は F-05 で足す。
export function UserDetail({ userId }: { userId: string }) {
  const { data: me } = useSuspenseQuery(meQueryOptions);
  const { data: user, error, isPending } = useQuery(userQueryOptions(userId));
  const [dialog, setDialog] = useState<"ban" | "reset" | null>(null);
  const [notice, setNotice] = useState<string>();

  if (isApiError(error, "NOT_FOUND")) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState icon={UserX} title="ユーザーが見つかりません" />
      </div>
    );
  }
  if (error) return <ErrorBanner error={error} />;
  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-40" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-56" />
          </div>
        </div>
      </div>
    );
  }

  const isSelf = user.id === me.id;
  return (
    <>
      <Breadcrumbs items={[BREADCRUMB_ROOT, { label: user.name }]} />
      <div className="mt-2 flex items-center gap-4">
        <UserAvatar name={user.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">{user.name}</h1>
            <UserStatus user={user} />
          </div>
          <p className="text-sm text-muted-foreground">
            {user.username} ・ {user.email}
          </p>
        </div>
        {/* 自分自身には出さない（D-37、D-38） */}
        {!isSelf && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" aria-label="その他の操作" />}
            >
              <Ellipsis aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => setDialog("reset")}>
                <KeyRound className="text-muted-foreground" aria-hidden />
                パスワードを再設定
              </DropdownMenuItem>
              {!user.banned && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setDialog("ban")}>
                    <UserX aria-hidden />
                    無効化
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {notice && (
        <div
          role="status"
          className="mt-4 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm"
        >
          <CircleCheck className="size-4 text-success" aria-hidden />
          {notice}
        </div>
      )}
      <div className="mt-6 grid gap-6 lg:grid-cols-[22rem_1fr]">
        <RoleSwitches user={user} isSelf={isSelf} />
      </div>
      {!isSelf && (
        <>
          <ResetPasswordDialog
            user={user}
            open={dialog === "reset"}
            onOpenChange={(open) => setDialog(open ? "reset" : null)}
            onDone={() => setNotice("パスワードを再設定しました。次のログインで変更を求めます。")}
          />
          <BanUserDialog
            user={user}
            open={dialog === "ban"}
            onOpenChange={(open) => setDialog(open ? "ban" : null)}
          />
        </>
      )}
    </>
  );
}
