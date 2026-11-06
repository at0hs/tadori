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

// 無効化の確認（screens.md 4章）。実行中の実行の件数の案内（D-36）は F-05 で足す。
export function BanUserDialog({
  user,
  open,
  onOpenChange,
}: {
  user: AdminUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ban = useBanUser(user.id);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
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
            </AlertDialogDescription>
          </div>
        </div>
        {ban.error && <ErrorBanner error={ban.error} />}
        <div className="mt-2 flex justify-end gap-2">
          <AlertDialogCancel variant="ghost">キャンセル</AlertDialogCancel>
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
