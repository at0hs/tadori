import type { AdminUser } from "@tadori/shared";
import { UserX } from "lucide-react";
import { ErrorBanner } from "@/components/error-banner.tsx";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useBanUser } from "./queries.ts";

// 無効化の確認（screens.md 4章）。実行中の実行があれば件数を案内する（D-36）。
// 有効に戻す操作はないので、元に戻せないことを伝える（authorization.md、受入テストの P-2）。
export function BanUserDialog({
  user,
  runningCount,
  open,
  onOpenChange,
}: {
  user: AdminUser;
  runningCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ban = useBanUser(user.id);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // 送信中は閉じない（結果を見届けられるように）
        if (!next && ban.isPending) return;
        if (!next) ban.reset();
        onOpenChange(next);
      }}
    >
      <AlertDialogContent className="p-6 data-[size=default]:sm:max-w-md">
        <div className="flex gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
            <UserX className="size-4" aria-hidden />
          </div>
          <div className="grid gap-1">
            <AlertDialogTitle className="font-semibold">
              {user.name} を無効化しますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              無効化すると、このユーザーはログインできなくなります。記録との紐づけは残ります。
              無効化は元に戻せません。このユーザー名は、新しく作るユーザーにも使えなくなります。
            </AlertDialogDescription>
          </div>
        </div>
        {runningCount > 0 && (
          <div className="rounded-lg bg-muted px-4 py-3 text-sm">
            このユーザーの実行中の実行が <b className="text-base">{runningCount}</b>{" "}
            件あります。無効化した後、管理者が実行の画面から中止できます。
          </div>
        )}
        {ban.error && <ErrorBanner error={ban.error} />}
        <div className="mt-2 flex justify-end gap-2">
          <AlertDialogCancel variant="ghost" disabled={ban.isPending}>
            キャンセル
          </AlertDialogCancel>
          <Button
            className="bg-destructive text-destructive-foreground hover:bg-destructive/85"
            disabled={ban.isPending}
            onClick={() => ban.mutate(undefined, { onSuccess: () => onOpenChange(false) })}
          >
            無効化する
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
