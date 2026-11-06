import type { MeResponse } from "@tadori/shared";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { AppLogo } from "@/components/app-logo.tsx";
import { LoginForm } from "@/features/auth/login-form.tsx";
import { api, isApiError } from "@/lib/api.ts";
import { safeRedirect } from "@/lib/redirect.ts";

// S-01
export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async ({ search }) => {
    // ログイン済みなら行き先へ。キャッシュを通さずに確かめる（未ログインの 401 を共通の処理に渡さない）。
    let me: MeResponse;
    try {
      me = await (await api.me.$get()).json();
    } catch (e) {
      if (isApiError(e, "UNAUTHENTICATED")) return;
      throw e;
    }
    throw redirect({
      to: me.mustChangePassword ? "/account/password" : safeRedirect(search.redirect),
    });
  },
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <AppLogo size="lg" />
          <h1 className="mt-3 text-2xl font-semibold tracking-wide">Tadori</h1>
          <p className="mt-1 text-sm text-muted-foreground">手順書と作業記録</p>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <LoginForm redirect={redirect} />
        </div>
      </div>
    </div>
  );
}
