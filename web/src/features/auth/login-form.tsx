import { zodResolver } from "@hookform/resolvers/zod";
import type { MeResponse } from "@tadori/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ErrorBanner } from "@/components/error-banner.tsx";
import { Field } from "@/components/field.tsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { meQueryOptions } from "@/features/me/queries.ts";
import { authClient } from "@/lib/auth-client.ts";
import { safeRedirect } from "@/lib/redirect.ts";

const schema = z.object({
  username: z.string().trim().min(1, "ユーザー名を入力してください。"),
  password: z.string().min(1, "パスワードを入力してください。"),
});
type Values = z.infer<typeof schema>;

// S-01。失敗の理由（ユーザー名・パスワードの違い、無効化）は区別しない（screens.md）。
export function LoginForm({ redirect }: { redirect?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    setFailure(undefined);
    const { error } = await authClient.signIn.username(values);
    if (error) {
      setFailure(
        error.status === 429
          ? "ログインの試行が多すぎます。しばらく待ってから試してください。"
          : "ログインできませんでした",
      );
      return;
    }
    let me: MeResponse;
    try {
      me = await queryClient.fetchQuery({ ...meQueryOptions, staleTime: 0 });
    } catch {
      setFailure("ログインしましたが、画面を開けませんでした。時間をおいて試してください。");
      return;
    }
    await navigate({ to: me.mustChangePassword ? "/account/password" : safeRedirect(redirect) });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <ErrorBanner message={failure} />
      <Field label="ユーザー名" htmlFor="username" error={errors.username?.message}>
        <Input
          id="username"
          autoComplete="username"
          autoFocus
          aria-invalid={!!errors.username}
          {...register("username")}
        />
      </Field>
      <Field label="パスワード" htmlFor="password" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          {...register("password")}
        />
      </Field>
      <Button type="submit" className="mt-2 w-full" disabled={isSubmitting}>
        ログイン
      </Button>
    </form>
  );
}
