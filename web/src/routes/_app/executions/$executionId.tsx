import { createFileRoute } from "@tanstack/react-router";
import { ExecutionPage } from "@/features/executions/execution-page.tsx";

// S-12
export const Route = createFileRoute("/_app/executions/$executionId")({
  component: ExecutionRoute,
});

function ExecutionRoute() {
  const { executionId } = Route.useParams();
  return <ExecutionPage key={executionId} executionId={executionId} />;
}
