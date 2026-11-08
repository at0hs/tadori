import { createFileRoute } from "@tanstack/react-router";
import { DraftDiffPage } from "@/features/procedures/diff/diff-page.tsx";

// S-17
export const Route = createFileRoute("/_app/procedures/$procedureId/draft/diff")({
  component: DiffPage,
});

function DiffPage() {
  const { procedureId } = Route.useParams();
  return <DraftDiffPage key={procedureId} procedureId={procedureId} />;
}
