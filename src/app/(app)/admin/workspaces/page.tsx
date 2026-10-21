import { ArrowRight, Building2, Settings2, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { formatCnpj } from "@/lib/format";
import { StatusDot } from "@/components/shared/StatusDot";
import { NovoWorkspace } from "@/components/admin/WorkspaceForm";
import { SUBSCRIPTION_STATUS_LABEL } from "@/lib/subscription-labels";
import type { ManagementMode, SubscriptionStatus } from "@/generated/prisma/enums";
import { criarWorkspace } from "./actions";

// Os tons das situações da assinatura, os mesmos de Administração › Assinaturas.
const TOM_DA_ASSINATURA: Record<SubscriptionStatus, TomDoSelo> = {
  ACTIVE: "sucesso",
  TRIAL: "marca",
  PAST_DUE: "perigo",
  CANCELED: "neutro",
};

const MODO: Record<ManagementMode, string> = { MANAGED: "Gerenciado", SELF_SERVICE: "Autoatendimento" };

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "starter" → "Starter": o `plan` antigo do tenant é um código em minúsculas. */
const nomeDoPlano = (nome: string) => nome.charAt(0).toUpperCase() + nome.slice(1);

/**
 * Workspaces em cartões, com o plano e o uso (escolha 9A dos Ajustes de 15/10,
 * 20/10/2026): era uma lista com a logo, o nome, o CNPJ e "Gerenciar acesso".
 * Plano, usuários e empresas já estavam no banco; a tela só não mostrava.
 *
 * O plano é o da assinatura; sem assinatura, o código antigo do tenant. Os
 * usuários são os ativos (a mesma conta de Assinaturas), e as empresas, as de
 * situação Ativa. O cartão inteiro abre a página do workspace (foto e acesso
 * dos Super Admins).
 */
export default async function WorkspacesPage({ searchParams }: { searchParams: Promise<{ novo?: string }> }) {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") notFound();
  // `?novo=1` é o endereço antigo /admin/workspaces/novo: a lista abre com a janela aberta.
  const { novo } = await searchParams;

  const prisma = getPrisma();
  const [tenants, usuarios, empresas] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        cnpj: true,
        slug: true,
        plan: true,
        logoUrl: true,
        active: true,
        managementMode: true,
        subscription: { select: { status: true, plan: { select: { name: true } } } },
      },
    }),
    prisma.user.groupBy({ by: ["tenantId"], where: { active: true }, _count: { _all: true } }),
    prisma.company.groupBy({ by: ["tenantId"], where: { status: "ACTIVE" }, _count: { _all: true } }),
  ]);
  const usuariosPorTenant = new Map(usuarios.map((u) => [u.tenantId, u._count._all]));
  const empresasPorTenant = new Map(empresas.map((e) => [e.tenantId, e._count._all]));

  return (
    <PageContainer>
      <PageHeader
        title="Workspaces"
        subtitle={<>{plural(tenants.length, "workspace", "workspaces")} — o plano, o uso e o acesso de cada escritório.</>}
        // "+ Novo workspace" numa janela (P19, 15/10/2026): eram dois campos numa página inteira.
        action={<NovoWorkspace key={novo === "1" ? "novo" : "lista"} action={criarWorkspace} abertaDeInicio={novo === "1"} />}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {tenants.map((t) => {
          const assinatura = t.subscription;
          return (
            <Card key={t.id} href={`/admin/workspaces/${t.id}`} className="flex flex-col p-4">
              <div className="flex items-start gap-3">
                <AvatarImage src={t.logoUrl} name={t.name} size={40} shape="lg" fontSize={15} />
                <div className="min-w-0 flex-1">
                  <p className="text-fs-3 font-semibold text-fg truncate">
                    {t.name}
                    {t.id === ctx.tenantId && <span className="font-normal text-fg-muted"> · este workspace</span>}
                  </p>
                  <p className="text-fs-1 text-fg-muted font-mono truncate">{t.cnpj ? formatCnpj(t.cnpj) : t.slug}</p>
                </div>
                {/* Ativo/inativo de cadastro é a bolinha (escolha 2A, 08/10/2026). */}
                <StatusDot
                  color={t.active ? "var(--c41-success)" : "var(--c41-fg-muted)"}
                  label={t.active ? "Ativo" : "Inativo"}
                  className="flex-shrink-0 mt-0.5"
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge variant="neutral">Plano {nomeDoPlano(assinatura?.plan.name ?? t.plan)}</Badge>
                {assinatura ? (
                  <Selo tom={TOM_DA_ASSINATURA[assinatura.status]}>{SUBSCRIPTION_STATUS_LABEL[assinatura.status]}</Selo>
                ) : (
                  <Selo tom="neutro">Sem assinatura</Selo>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-fs-2 text-fg-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <Users size={14} className="text-fg-muted" aria-hidden />
                  {plural(usuariosPorTenant.get(t.id) ?? 0, "usuário", "usuários")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Building2 size={14} className="text-fg-muted" aria-hidden />
                  {plural(empresasPorTenant.get(t.id) ?? 0, "empresa ativa", "empresas ativas")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Settings2 size={14} className="text-fg-muted" aria-hidden />
                  {MODO[t.managementMode]}
                </span>
              </div>

              <div className="mt-auto pt-3">
                <div className="flex justify-end border-t border-border pt-3">
                  <span className="inline-flex items-center gap-1 text-label font-medium text-brand">
                    Abrir <ArrowRight size={14} aria-hidden />
                  </span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </PageContainer>
  );
}
