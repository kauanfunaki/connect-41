import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { DeleteButton } from "@/components/pessoas/DeleteButton";
import { lancarEvento, atualizarStatusLancamento, excluirLancamento } from "./actions";
import { atualizarStatusCompetencia, excluirCompetencia } from "../actions";
import { LancarEventoForm } from "@/components/folha/LancarEventoForm";
import { PayrollEntryRow } from "@/components/folha/PayrollEntryRow";
import { CompetenciaStatusForm } from "@/components/folha/CompetenciaStatusForm";

const MONTH_LABEL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default async function CompetenciaPage({
  params,
}: {
  params: Promise<{ id: string; competencyId: string }>;
}) {
  const { id: companyId, competencyId } = await params;
  const ctx = await getAuthContext();
  const canManage = canWrite(ctx.role);
  const canViewPayroll = await canViewSensitiveField(ctx, "SALARIO");

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!company) notFound();
  if (!canViewPayroll) notFound();

  const competencia = await prisma.payrollCompetency.findFirst({
    where: { id: competencyId, tenantId: ctx.tenantId, companyId },
    include: {
      entries: {
        orderBy: { createdAt: "asc" },
        include: { person: { select: { id: true, name: true } } },
      },
    },
  });
  if (!competencia) notFound();

  const linkedPersonIds = new Set(competencia.entries.map((e) => e.personId));
  const colaboradores = await prisma.person.findMany({
    where: { tenantId: ctx.tenantId, type: "COLABORADOR", active: true, currentCompanyId: companyId, id: { notIn: [...linkedPersonIds] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const deleteAction = excluirCompetencia.bind(null, companyId, competencyId);
  const lancarEventoAction = lancarEvento.bind(null, companyId, competencyId);
  const atualizarStatusAction = atualizarStatusCompetencia.bind(null, companyId, competencyId);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/empresas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Empresas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/empresas/${companyId}/folha`} className="text-[13px] text-fg-muted hover:text-fg transition-colors">Folha</Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">{MONTH_LABEL[competencia.month - 1]}/{competencia.year}</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">
            {MONTH_LABEL[competencia.month - 1]}/{competencia.year} — {company.name}
          </h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {competencia.entries.length} lançamento{competencia.entries.length !== 1 ? "s" : ""}
          </p>
        </div>
        {canManage && <DeleteButton action={deleteAction} nome={`competência ${MONTH_LABEL[competencia.month - 1]}/${competencia.year}`} />}
      </div>

      {canManage && (
        <div className="mb-4">
          <CompetenciaStatusForm action={atualizarStatusAction} currentStatus={competencia.status} />
        </div>
      )}

      <div className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-[14px] font-semibold text-fg mb-3">Lançamentos</h2>

        {competencia.entries.length === 0 ? (
          <p className="text-[13px] text-fg-muted mb-3">Nenhum lançamento ainda.</p>
        ) : (
          <div className="mb-3">
            {competencia.entries.map((e) => (
              <PayrollEntryRow
                key={e.id}
                entry={{
                  id: e.id,
                  personId: e.person.id,
                  personName: e.person.name,
                  grossSalary: e.grossSalary.toString(),
                  status: e.status,
                }}
                updateAction={atualizarStatusLancamento.bind(null, companyId, competencyId, e.id)}
                removeAction={excluirLancamento.bind(null, companyId, competencyId, e.id)}
                canManage={canManage}
              />
            ))}
          </div>
        )}

        {canManage && <LancarEventoForm action={lancarEventoAction} colaboradores={colaboradores} />}
      </div>
    </div>
  );
}
