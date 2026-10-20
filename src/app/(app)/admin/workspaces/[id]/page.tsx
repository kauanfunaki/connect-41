import { ImageIcon, KeyRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { ToggleAccessButton } from "@/components/admin/ToggleAccessButton";
import { WorkspaceLogoUpload } from "@/components/admin/WorkspaceLogoUpload";
import { PageContainer } from "@/components/shared/PageContainer";
import { SecaoDeConfiguracao } from "@/components/configuracoes/SecaoDeConfiguracao";
import { concederAcesso, revogarAcesso } from "../actions";
import { formatCnpj } from "@/lib/format";

export default async function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") notFound();

  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) notFound();

  // SUPER_ADMINs de outros tenants — candidatos a ganhar acesso a este workspace.
  // Quem já é "titular" deste tenant (User.tenantId === id) já enxerga por padrão.
  const [otherSuperAdmins, grants] = await Promise.all([
    prisma.user.findMany({
      where: { role: "SUPER_ADMIN", tenantId: { not: id } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, tenantId: true },
    }),
    prisma.userTenantAccess.findMany({ where: { tenantId: id }, select: { userId: true } }),
  ]);
  const grantedIds = new Set(grants.map((g) => g.userId));

  return (
    <PageContainer>

      {/* O CNPJ era um parágrafo solto embaixo do cabeçalho; é o subtítulo dele. */}
      <PageHeader
        title={tenant.name}
        subtitle={<span className="font-mono">{tenant.cnpj ? formatCnpj(tenant.cnpj) : tenant.slug}</span>}
      />

      {/* Seções em duas colunas (escolha 1B dos Ajustes de 15/10, 20/10/2026):
          o título e a explicação à esquerda, o cartão à direita. Eram dois
          cartões empilhados na largura toda, o da foto quase vazio. */}
      <SecaoDeConfiguracao
        titulo="Foto do workspace"
        descricao="A imagem que identifica o workspace no topo do Connect e na troca de escritório."
        icone={<ImageIcon />}
      >
        <Card className="p-5">
          <WorkspaceLogoUpload tenantId={tenant.id} tenantName={tenant.name} logoUrl={tenant.logoUrl} />
        </Card>
      </SecaoDeConfiguracao>

      <SecaoDeConfiguracao
        titulo="Acesso de Super Admins"
        descricao="Super Admins titulares de outros workspaces podem ganhar acesso pra visualizar este também, sem precisar de uma conta separada."
        icone={<KeyRound />}
      >
        <Card className="p-5">
          {otherSuperAdmins.length === 0 ? (
            <p className="text-fs-3 text-fg-muted">Não há Super Admins em outros workspaces.</p>
          ) : (
            <div className="divide-y divide-border">
              {otherSuperAdmins.map((u) => {
                const hasAccess = grantedIds.has(u.id);
                const toggleAction = hasAccess
                  ? revogarAcesso.bind(null, id, u.id)
                  : concederAcesso.bind(null, id, u.id);
                return (
                  <div key={u.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-fs-3 text-fg truncate">{u.name}</p>
                      <p className="text-fs-1 text-fg-muted truncate">{u.email}</p>
                    </div>
                    <ToggleAccessButton action={toggleAction} hasAccess={hasAccess} nome={u.name} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </SecaoDeConfiguracao>
    </PageContainer>
  );
}
