import { createFileRoute } from "@tanstack/react-router";
import { EditProcedurePage } from "@/features/procedures/editor/editor-page.tsx";

// S-09
export const Route = createFileRoute("/_app/procedures/$procedureId/edit")({
  component: EditPage,
});

function EditPage() {
  const { procedureId } = Route.useParams();
  return <EditProcedurePage key={procedureId} procedureId={procedureId} />;
}
