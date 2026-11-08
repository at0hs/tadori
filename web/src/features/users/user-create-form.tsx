import { zodResolver } from "@hookform/resolvers/zod";
import { type CreateUserRequest, createUserRequestSchema } from "@tadori/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ErrorBanner } from "@/components/error-banner.tsx";
import { Field } from "@/components/field.tsx";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isApiError } from "@/lib/api.ts";
import { useCreateUser } from "./queries.ts";
import { RoleRadio } from "./role-radio.tsx";

const FIELDS = ["name", "username", "email", "password", "role"] as const;
type FieldName = (typeof FIELDS)[number];
const isFieldName = (path: string): path is FieldName =>
  (FIELDS as readonly string[]).includes(path);

// S-14。作成したユーザーは「パスワード変更が必要」になる。作成後は S-15 へ。
export function UserCreateForm() {
  const navigate = useNavigate();
  const create = useCreateUser();
  const [failure, setFailure] = useState<unknown>();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CreateUserRequest>({
    resolver: zodResolver(createUserRequestSchema),
    // ロールは既定で何も選ばない（ui.md 5.4）
    defaultValues: { name: "", username: "", email: "", password: "" },
  });

  const onSubmit = (values: CreateUserRequest) => {
    setFailure(undefined);
    create.mutate(values, {
      onSuccess: ({ id }) => navigate({ to: "/admin/users/$userId", params: { userId: id } }),
      onError: (e) => {
        // サーバーの検証エラーは該当する欄に出す（conventions.md 3.1）。入力は残す
        const fieldErrors = isApiError(e, "VALIDATION_FAILED")
          ? e.errors.filter((fe) => isFieldName(fe.path))
          : [];
        if (fieldErrors.length > 0) {
          for (const fe of fieldErrors) setError(fe.path as FieldName, { message: fe.message });
        } else {
          setFailure(e);
        }
      },
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="mt-4 max-w-xl rounded-xl border bg-card p-6"
    >
      <div className="grid gap-5">
        {failure !== undefined && <ErrorBanner error={failure} />}
        <Field label="名前" htmlFor="name" error={errors.name?.message}>
          <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
        </Field>
        <Field
          label="ユーザー名"
          htmlFor="username"
          error={errors.username?.message}
          description="ログインに使います。英数字と「_」「.」"
        >
          <Input
            id="username"
            autoComplete="off"
            aria-invalid={!!errors.username}
            {...register("username")}
          />
        </Field>
        <Field
          label="メールアドレス"
          htmlFor="email"
          error={errors.email?.message}
          description="連絡先として記録するだけで、メールは送りません"
        >
          <Input
            id="email"
            type="email"
            autoComplete="off"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
        </Field>
        <Field
          label="仮のパスワード"
          htmlFor="password"
          error={errors.password?.message}
          description="初回のログインで変更してもらいます"
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
        </Field>
        <div className="grid gap-1.5">
          <span id="role-label" className="text-sm font-medium">
            ロール
          </span>
          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <RoleRadio
                name={field.name}
                labelledBy="role-label"
                value={field.value}
                onChange={field.onChange}
                invalid={!!errors.role}
              />
            )}
          />
          {errors.role?.message && (
            <p className="text-sm text-destructive">{errors.role.message}</p>
          )}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Link to="/admin/users" className={buttonVariants({ variant: "ghost" })}>
          キャンセル
        </Link>
        <Button type="submit" disabled={create.isPending}>
          作成する
        </Button>
      </div>
    </form>
  );
}
