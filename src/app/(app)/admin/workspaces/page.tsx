import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { formatCnpj } from "@/lib/format";

export default async function WorkspacesPage() {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") notFound();

  const prisma = getPrisma();
  const tenants = await prisma.tenant.findMany({ orderBy: { name: "asc" } });

  return (
    <PageContainer variant="narrow">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Workspaces</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {tenants.length} workspace{tenants.length !== 1 ? "s" : ""} cadastrado{tenants.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/admin/workspaces/novo"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
        >
          + Novo Workspace
        </Link>
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="divide-y divide-border">
          {tenants.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <AvatarImage src={t.logoUrl} name={t.name} size={32} shape="lg" fontSize={13} />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-fg truncate">{t.name}</p>
                  <p className="text-[11px] text-fg-muted font-mono truncate">{t.cnpj ? formatCnpj(t.cnpj) : t.slug}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {!t.active && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-2 text-fg-muted border border-border">
                    Inativo
                  </span>
                )}
                <Link href={`/admin/workspaces/${t.id}`} className="text-[12px] text-fg-muted hover:text-fg transition-colors">
                  Gerenciar acesso
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
