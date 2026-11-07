import { type AdminUser, ROLES, type Role } from "@tadori/shared";
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
import { Switch } from "@/components/ui/switch";
import { ROLE_ICONS, ROLE_LABELS } from "@/lib/roles.ts";
import { useSetRole } from "./queries.ts";

// ロールの付与・剥奪（screens.md の S-15）。1つずつ切り替え、押したらすぐ反映する。
// 自分の管理者ロールは外せない（D-38）。実行中の実行があるユーザーの実行者ロールを外すときだけ、
// 件数を案内する確認を挟む（D-36）。
export function RoleSwitches({
  user,
  isSelf,
  runningCount,
}: {
  user: AdminUser;
  isSelf: boolean;
  runningCount: number;
}) {
  const setRole = useSetRole(user.id, isSelf);
  const [confirming, setConfirming] = useState(false);
  const pendingRole = setRole.isPending ? setRole.variables?.role : undefined;

  const checked = (role: Role) =>
    pendingRole === role ? (setRole.variables?.on ?? false) : user.roles.includes(role);

  const change = (role: Role, on: boolean) => {
    if (role === "executor" && !on && runningCount > 0) {
      setConfirming(true);
      return;
    }
    setRole.mutate({ role, on });
  };

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="font-semibold">ロール</h2>
      <p className="text-xs text-muted-foreground">切り替えるとすぐに反映します</p>
      {setRole.error && (
        <div className="mt-3">
          <ErrorBanner error={setRole.error} />
        </div>
      )}
      <ul className="mt-3 divide-y">
        {ROLES.map((role) => {
          const Icon = ROLE_ICONS[role];
          const locked = isSelf && role === "admin";
          return (
            <li key={role} className="py-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
                  {ROLE_LABELS[role]}
                </span>
                <Switch
                  aria-label={ROLE_LABELS[role]}
                  checked={checked(role)}
                  disabled={locked || setRole.isPending}
                  onCheckedChange={(on) => change(role, on)}
                />
              </div>
              {locked && (
                <p className="mt-1 text-xs text-muted-foreground">自分の管理者ロールは外せません</p>
              )}
            </li>
          );
        })}
      </ul>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent className="p-6 data-[size=default]:sm:max-w-md">
          <div className="flex gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
              <UserX className="size-4" aria-hidden />
            </div>
            <div className="grid gap-1">
              <AlertDialogTitle className="font-semibold">
                {user.name} の実行者ロールを外しますか？
              </AlertDialogTitle>
              <AlertDialogDescription>
                外すと、このユーザーは実行を開始・操作できなくなります。
              </AlertDialogDescription>
            </div>
          </div>
          <div className="rounded-lg bg-muted px-4 py-3 text-sm">
            このユーザーの実行中の実行が <b className="text-base">{runningCount}</b>{" "}
            件あります。ロールを外した後、管理者が実行の画面から中止できます。
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <AlertDialogCancel variant="ghost">キャンセル</AlertDialogCancel>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/85"
              onClick={() => {
                setConfirming(false);
                setRole.mutate({ role: "executor", on: false });
              }}
            >
              実行者ロールを外す
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
