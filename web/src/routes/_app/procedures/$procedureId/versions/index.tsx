import { createFileRoute } from "@tanstack/react-router";
import { VersionList } from "@/features/procedures/procedure-versions.tsx";

// S-06
export const Route = createFileRoute("/_app/procedures/$procedureId/versions/")({
  component: VersionsPage,
});

function VersionsPage() {
  const { procedureId } = Route.useParams();
  return <VersionList key={procedureId} procedureId={procedureId} />;
}
