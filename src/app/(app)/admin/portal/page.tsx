import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Users2 } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { formatInstantDate } from "@/lib/format";
import { NovoAcessoDoPortal, PortalAcessosList } from "@/components/portal/PortalAcessosList";
import { criarAcessoDoPortal, enviarLinkDeSenha, alternarAcessoDoPortal } from "./actions";

// Quem do lado do cliente entra no portal. Tela de administração do tenant, não
// de setor: dar acesso a alguém de fora da 41 não é operação de fiscal nem de
// BPO.
export default async function AdminPortalPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const [acessos, grupos] = await Promise.all([
    prisma.portalUser.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        lastLoginAt: true,
        clientGroup: { select: { name: true } },
      },
    }),
    prisma.clientGroup.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { companies: true } } },
    }),
  ]);

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      {/* A explicação era um parágrafo solto depois do cabeçalho; é o subtítulo dele. */}
      <PageHeader
        title="Acessos do portal"
        subtitle="Contas de clientes que entram no portal para ver os próprios documentos fiscais. Cada conta
          enxerga as empresas de um cliente — e só elas."
        action={
          grupos.length > 0 && (
            <NovoAcessoDoPortal
              clientes={grupos.map((g) => ({ id: g.id, nome: g.name, empresas: g._count.companies }))}
              criarAction={criarAcessoDoPortal}
            />
          )
        }
      />

      {grupos.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users2 />}
            title="Nenhum cliente cadastrado"
            description="O acesso do portal é dado a um cliente, que agrupa as empresas. Crie um cliente em Empresas antes."
          />
        </Card>
      ) : (
        <PortalAcessosList
          acessos={acessos.map((a) => ({
            id: a.id,
            nome: a.name,
            email: a.email,
            ativo: a.active,
            cliente: a.clientGroup.name,
            ultimoAcesso: a.lastLoginAt ? formatInstantDate(a.lastLoginAt) : null,
          }))}
          enviarLinkAction={enviarLinkDeSenha}
          alternarAction={alternarAcessoDoPortal}
        />
      )}
    </PageContainer>
  );
}
