import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/features/me/home-page.tsx";

// S-03（ui.md 9章）
export const Route = createFileRoute("/_app/")({
  component: HomePage,
});
