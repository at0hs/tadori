import { createFileRoute } from "@tanstack/react-router";
import { NewProcedurePage } from "@/features/procedures/editor/editor-page.tsx";

// S-08
export const Route = createFileRoute("/_app/procedures/new")({
  component: NewProcedurePage,
});
