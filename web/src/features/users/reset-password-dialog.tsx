import { zodResolver } from "@hookform/resolvers/zod";
import {
  type AdminUser,
  type PasswordResetRequest,
  passwordResetRequestSchema,
} from "@tadori/shared";
import { useForm } from "react-hook-form";
import { ErrorBanner } from "@/components/error-banner.tsx";
import { Field } from "@/components/field.tsx";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useResetPassword } from "./queries.ts";

// パスワードの再設定（screens.md 4章、D-37）。再設定されたユーザーは次のログインで変更を求められる。
export function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
  onDone,
}: {
  user: AdminUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const resetPassword = useResetPassword(user.id);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordResetRequest>({
    resolver: zodResolver(passwordResetRequestSchema),
    defaultValues: { password: "" },
  });

  const close = (next: boolean) => {
    // 送信中は閉じない（結果を見届けられるように）
    if (!next && resetPassword.isPending) return;
    if (!next) {
      reset();
      resetPassword.reset();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="p-6 sm:max-w-md">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={handleSubmit(({ password }) =>
            resetPassword.mutate(password, {
              onSuccess: () => {
                close(false);
                onDone();
              },
            }),
          )}
        >
          <DialogHeader>
            <DialogTitle className="font-semibold">パスワードを再設定</DialogTitle>
            <DialogDescription>
              {user.name} の仮のパスワードを決めます。次のログインで変更を求めます。
            </DialogDescription>
          </DialogHeader>
          {resetPassword.error && <ErrorBanner error={resetPassword.error} />}
          <Field label="仮のパスワード" htmlFor="reset-password" error={errors.password?.message}>
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose render={<Button variant="ghost" disabled={resetPassword.isPending} />}>
              キャンセル
            </DialogClose>
            <Button type="submit" disabled={resetPassword.isPending}>
              再設定する
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
