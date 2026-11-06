import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header.tsx";
import { UserCreateForm } from "@/features/users/user-create-form.tsx";

// S-14
export const Route = createFileRoute("/_app/admin/users/new")({
  component: () => (
    <>
      <PageHeader
        title="ユーザーを作成"
        breadcrumbs={[{ label: "ユーザー", to: "/admin/users" }, { label: "新規作成" }]}
      />
      <UserCreateForm />
    </>
  ),
});
