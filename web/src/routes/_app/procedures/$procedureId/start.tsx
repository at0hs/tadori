import { createFileRoute } from "@tanstack/react-router";
import { StartExecutionPage } from "@/features/executions/start-form.tsx";

// S-10
export const Route = createFileRoute("/_app/procedures/$procedureId/start")({
  component: StartPage,
});

function StartPage() {
  const { procedureId } = Route.useParams();
  return <StartExecutionPage key={procedureId} procedureId={procedureId} />;
}
