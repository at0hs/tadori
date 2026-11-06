import { zodResolver } from "@hookform/resolvers/zod";
import { passwordSchema } from "@tadori/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ErrorBanner } from "@/components/error-banner.tsx";
import { Field } from "@/components/field.tsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client.ts";
import { meQueryOptions } from "./queries.ts";

const schema = z
  .object({
    currentPassword: z.string().min(1, "現在のパスワードを入力してください。"),
    newPassword: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ["confirm"],
    message: "新しいパスワードと一致しません",
  });
type Values = z.infer<typeof schema>;

// S-02。変えるときは、ほかの端末のログインを切る（ui.md 6章）。
export function PasswordForm({ mustChange }: { mustChange: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<string>();
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    setFailure(undefined);
    setDone(false);
    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: true,
    });
    if (error) {
      if (error.code === "INVALID_PASSWORD") {
        setError("currentPassword", { message: "現在のパスワードが違います" });
      } else {
        setFailure("パスワードを変更できませんでした。時間をおいて試してください。");
      }
      return;
    }
    // 表示中のヘッダも取り直す（removeQueries では表示中の部品に伝わらない）
    await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
    if (mustChange) {
      await navigate({ to: "/" });
      return;
    }
    reset();
    setDone(true);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
      <ErrorBanner message={failure} />
      {done && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm"
        >
          <CircleCheck className="size-4 text-success" aria-hidden />
          パスワードを変更しました
        </div>
      )}
      <Field
        label="現在のパスワード"
        htmlFor="currentPassword"
        error={errors.currentPassword?.message}
      >
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.currentPassword}
          {...register("currentPassword")}
        />
      </Field>
      <Field
        label="新しいパスワード"
        htmlFor="newPassword"
        error={errors.newPassword?.message}
        description="8文字以上"
      >
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.newPassword}
          {...register("newPassword")}
        />
      </Field>
      <Field label="新しいパスワード（確認）" htmlFor="confirm" error={errors.confirm?.message}>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirm}
          {...register("confirm")}
        />
      </Field>
      <Button type="submit" className="mt-1 w-full" disabled={isSubmitting}>
        変更する
      </Button>
    </form>
  );
}
