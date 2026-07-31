import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { WorkspaceForm } from "@/components/admin/WorkspaceForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { criarWorkspace } from "../actions";

export default async function NovoWorkspacePage() {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") notFound();

  return (
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/workspaces" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Workspaces
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Novo Workspace</span>
      </div>
      <PageHeader title="Novo Workspace" />

      <Card className="p-6">
        <WorkspaceForm action={criarWorkspace} cancelHref="/admin/workspaces" />
      </Card>
    </PageContainer>
  );
}
