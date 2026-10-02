import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { formatCnpj } from "@/lib/format";
import { Selo } from "@/components/ui/Selo";

export default async function WorkspacesPage() {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") notFound();

  const prisma = getPrisma();
  const tenants = await prisma.tenant.findMany({ orderBy: { name: "asc" } });

  return (
    <PageContainer>
      <PageHeader
        title="Workspaces"
        subtitle={<>{tenants.length} workspace{tenants.length !== 1 ? "s" : ""} cadastrado{tenants.length !== 1 ? "s" : ""}</>}
        action={<><Button
          href="/admin/workspaces/novo"
          variant="primary" className="font-medium"
        >
          + Novo Workspace
        </Button></>}
      />
      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] overflow-hidden">
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
                  <Selo tom="neutro">
                    Inativo
                  </Selo>
                )}
                {/* Botão, e não texto cinza (polimento de 30/09). */}
                <Button href={`/admin/workspaces/${t.id}`} variant="secondary" size="xs">
                  <KeyRound size={11} /> Gerenciar acesso
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
