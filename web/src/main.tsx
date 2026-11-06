import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createQueryClient } from "@/lib/query.ts";
import { routeTree } from "./routeTree.gen.ts";
import "./index.css";

// 画面全体に効くエラーの動き（screens.md 8章、ui.md 5.2）
const queryClient = createQueryClient((action) => {
  if (action === "login") {
    // ログイン画面そのものでの未ログインは、ここでは扱わない（ログイン画面が自分で確かめる）
    if (window.location.pathname === "/login") return;
    queryClient.clear();
    void router.navigate({
      to: "/login",
      search: { redirect: window.location.pathname + window.location.search },
    });
    return;
  }
  void router.navigate({ to: "/account/password" });
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("#root がない");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
