import type { MeResponse } from "@tadori/shared";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell.tsx";
import { meQueryOptions } from "@/features/me/queries.ts";
import { isApiError } from "@/lib/api.ts";

// ログインが必要な画面の親（ui.md 5.3）。
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    let me: MeResponse;
    try {
      me = await context.queryClient.ensureQueryData(meQueryOptions);
    } catch (e) {
      if (isApiError(e, "UNAUTHENTICATED")) {
        throw redirect({ to: "/login", search: { redirect: location.href } });
      }
      throw e;
    }
    if (me.mustChangePassword && location.pathname !== "/account/password") {
      throw redirect({ to: "/account/password" });
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
