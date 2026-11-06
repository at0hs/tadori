import { zodResolver } from "@hookform/resolvers/zod";
import { type CreateUserRequest, createUserRequestSchema, ROLES } from "@tadori/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ErrorBanner } from "@/components/error-banner.tsx";
import { Field } from "@/components/field.tsx";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isApiError } from "@/lib/api.ts";
import { ROLE_LABELS } from "@/lib/roles.ts";
import { useCreateUser } from "./queries.ts";

const FIELDS = ["name", "username", "email", "password", "roles"] as const;
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
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CreateUserRequest>({
    resolver: zodResolver(createUserRequestSchema),
    defaultValues: { name: "", username: "", email: "", password: "", roles: [] },
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
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">ロール</legend>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((role) => (
              <label
                key={role}
                className="relative flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors select-none has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
              >
                <input
                  type="checkbox"
                  value={role}
                  className="peer absolute inset-0 cursor-pointer appearance-none rounded-full opacity-0"
                  {...register("roles")}
                />
                <Check className="hidden size-3.5 peer-checked:block" aria-hidden />
                {ROLE_LABELS[role]}
              </label>
            ))}
          </div>
          {errors.roles?.message && (
            <p className="text-sm text-destructive">{errors.roles.message}</p>
          )}
        </fieldset>
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
