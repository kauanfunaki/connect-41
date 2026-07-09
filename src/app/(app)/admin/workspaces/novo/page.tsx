import Link from "next/link";
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

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Novo Workspace</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <WorkspaceForm action={criarWorkspace} cancelHref="/admin/workspaces" />
      </div>
    </PageContainer>
  );
}
