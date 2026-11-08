import type { AdminUser, Role } from "@tadori/shared";
import { UserX } from "lucide-react";
import { useState } from "react";
import { ErrorBanner } from "@/components/error-banner.tsx";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useSetRole } from "./queries.ts";
import { RoleRadio } from "./role-radio.tsx";

// ロールの変更（screens.md の S-15、ui.md 5.4）。選んだらすぐ反映する。
// 自分のロールは変えられない（D-38）。実行中の実行があるユーザーを閲覧者に下げるときだけ、
// 件数を案内する確認を挟む（D-36）。
export function RoleSection({
  user,
  isSelf,
  runningCount,
}: {
  user: AdminUser;
  isSelf: boolean;
  runningCount: number;
}) {
  const setRole = useSetRole(user.id);
  const [confirming, setConfirming] = useState(false);
  // 送信中は選んだ値を先に出す。失敗したら取り直してサーバーの値に戻る
  const shown = setRole.isPending ? (setRole.variables ?? user.role) : user.role;

  const change = (role: Role) => {
    if (role === user.role) return;
    if (role === "viewer" && runningCount > 0) {
      setConfirming(true);
      return;
    }
    setRole.mutate(role);
  };

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 id="role-heading" className="font-semibold">
        ロール
      </h2>
      <p className="text-xs text-muted-foreground">選ぶとすぐに反映します</p>
      {setRole.error && (
        <div className="mt-3">
          <ErrorBanner error={setRole.error} />
        </div>
      )}
      <div className="mt-3">
        <RoleRadio
          name="role"
          labelledBy="role-heading"
          value={shown}
          onChange={change}
          deferKeyboard
          // 送信中は disabled にせず（フォーカスが外れるため）読み取り専用にする
          readOnly={setRole.isPending}
          disabled={isSelf}
          disabledReason={isSelf ? "自分のロールは変更できません" : undefined}
        />
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent className="p-6 data-[size=default]:sm:max-w-md">
          <div className="flex gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
              <UserX className="size-4" aria-hidden />
            </div>
            <div className="grid gap-1">
              <AlertDialogTitle className="font-semibold">
                {user.name} を閲覧者にしますか？
              </AlertDialogTitle>
              <AlertDialogDescription>
                閲覧者にすると、このユーザーは実行を開始・操作できなくなります。
              </AlertDialogDescription>
            </div>
          </div>
          <div className="rounded-lg bg-muted px-4 py-3 text-sm">
            このユーザーの実行中の実行が <b className="text-base">{runningCount}</b>{" "}
            件あります。閲覧者にした後、管理者が実行の画面から中止できます。
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <AlertDialogCancel variant="ghost">キャンセル</AlertDialogCancel>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/85"
              onClick={() => {
                setConfirming(false);
                setRole.mutate("viewer");
              }}
            >
              閲覧者にする
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
