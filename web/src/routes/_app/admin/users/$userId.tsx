import { createFileRoute } from "@tanstack/react-router";
import { UserDetail } from "@/features/users/user-detail.tsx";

// S-15
export const Route = createFileRoute("/_app/admin/users/$userId")({
  component: UserPage,
});

function UserPage() {
  const { userId } = Route.useParams();
  return <UserDetail key={userId} userId={userId} />;
}
