import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { notFound } from "next/navigation";
import { Clock, Plus } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite, podeExcluir } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { AcoesDoCadastro } from "@/components/empresas/AcoesDoCadastro";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { excluirTurno } from "./actions";

export default async function TurnosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: companyId } = await params;
  const ctx = await getAuthContext();
  const canManage = canWrite(ctx.role);

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  const turnos = await prisma.workShift.findMany({
    where: { tenantId: ctx.tenantId, companyId },
    orderBy: { name: "asc" },
  });

  const novoHref = `/empresas/${companyId}/turnos/novo`;

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: company.name, href: `/empresas/${companyId}?tab=operations`, truncate: true },
          { label: "Turnos" },
        ]}
      />

      <PageHeader
        title="Turnos"
        subtitle={`${turnos.length} turno${turnos.length !== 1 ? "s" : ""} cadastrado${turnos.length !== 1 ? "s" : ""} nesta empresa`}
        action={
          canManage && (
            <Button
              href={novoHref}
              variant="primary"
            >
              <Plus size={14} /> Novo turno
            </Button>
          )
        }
      />

      {turnos.length === 0 ? (
        <Card>
          {/* Sem repetir o "Novo turno": ele mora no cabeçalho, e o texto diz onde (P19, 15/10/2026). */}
          <EmptyState
            icon={<Clock />}
            title="Nenhum turno cadastrado"
            description={
              canManage
                ? "Use “+ Novo turno”, no alto da tela, para cadastrar os turnos de trabalho desta empresa, vincular colaboradores e organizar a escala."
                : "Os turnos desta empresa aparecem aqui quando forem cadastrados."
            }
          />
        </Card>
      ) : (
        <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] divide-y divide-border">
          {turnos.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-fs-3 text-fg font-medium">{t.name}</p>
                <p className="text-fs-2 text-fg-muted">{t.startTime} — {t.endTime}</p>
              </div>
              {canManage && (
                <AcoesDoCadastro editarHref={`/empresas/${companyId}/turnos/${t.id}/editar`} excluir={podeExcluir(ctx) ? excluirTurno.bind(null, t.id, companyId) : undefined} nome={t.name} />
              )}
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
