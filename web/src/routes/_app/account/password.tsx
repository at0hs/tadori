import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { PasswordForm } from "@/features/me/password-form.tsx";
import { meQueryOptions } from "@/features/me/queries.ts";

// S-02
export const Route = createFileRoute("/_app/account/password")({
  component: PasswordPage,
});

function PasswordPage() {
  const { data: me } = useSuspenseQuery(meQueryOptions);
  return (
    <div className="mx-auto max-w-md">
      {me.mustChangePassword && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <KeyRound className="mt-0.5 size-4 text-warning" aria-hidden />
          パスワードの変更が必要です。変更するまで、ほかの画面は使えません。
        </div>
      )}
      <h1 className="text-xl font-bold">パスワードの変更</h1>
      <div className="mt-4 rounded-xl border bg-card p-6">
        <PasswordForm mustChange={me.mustChangePassword} />
      </div>
    </div>
  );
}
