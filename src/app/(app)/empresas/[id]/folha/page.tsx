import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PayrollStatus } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { AbrirCompetenciaForm } from "@/components/folha/AbrirCompetenciaForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { abrirCompetencia } from "./actions";

const STATUS_LABEL: Record<PayrollStatus, string> = {
  PENDENTE:       "Pendente",
  EM_CONFERENCIA: "Em conferência",
  CONFERIDO:      "Conferido",
  ENVIADO:        "Enviado",
  PROCESSADO:     "Processado",
  CANCELADO:      "Cancelado",
};

const MONTH_LABEL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default async function FolhaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: companyId } = await params;
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

  const competencias = await prisma.payrollCompetency.findMany({
    where: { tenantId: ctx.tenantId, companyId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    include: { _count: { select: { entries: true } } },
  });

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <div className="flex items-center gap-2 mb-6">
        <Link href="/empresas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Empresas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/empresas/${companyId}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">
          {company.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Folha de Pagamento</span>
      </div>

      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Folha de Pagamento</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          {competencias.length} competência{competencias.length !== 1 ? "s" : ""} — controle e conferência de lançamentos, não motor de cálculo
        </p>
      </div>

      {canManage && <AbrirCompetenciaForm action={abrirCompetencia} companyId={companyId} />}

      {competencias.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState title="Nenhuma competência aberta ainda." />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {competencias.map((c) => (
            <Link
              key={c.id}
              href={`/empresas/${companyId}/folha/${c.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
            >
              <p className="text-[13px] text-fg">{MONTH_LABEL[c.month - 1]}/{c.year}</p>
              <span className="text-[12px] text-fg-muted">
                {STATUS_LABEL[c.status]} · {c._count.entries} lançamento{c._count.entries !== 1 ? "s" : ""}
              </span>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
