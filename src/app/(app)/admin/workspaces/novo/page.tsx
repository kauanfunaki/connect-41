import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { WorkspaceForm } from "@/components/admin/WorkspaceForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { criarWorkspace } from "../actions";

export default async function NovoWorkspacePage() {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") notFound();

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Workspaces", href: "/admin/workspaces" }, { label: "Novo Workspace" }]} />
      <PageHeader title="Novo Workspace" />

      <div className="max-w-[720px]">
        <Card className="p-6">
          <WorkspaceForm action={criarWorkspace} cancelHref="/admin/workspaces" />
        </Card>
      </div>
    </PageContainer>
  );
}
