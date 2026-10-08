import { PageHeader } from "@/components/ui/PageHeader";
import { PessoaBreadcrumb } from "@/components/pessoas/PessoaBreadcrumb";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { InfoRow } from "@/components/empresas/InfoRow";
import { BackButton } from "@/components/shared/BackButton";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { SalaryHistorySection } from "@/components/pessoas/SalaryHistorySection";
import { formatCalendarDate, formatarReais } from "@/lib/format";
// Era `R$ ${decimal}` ("R$ 3500.5"). `brl` é o formatador de reais que já
// existia (Valora); troca pelo `formatarReais` de lib/format.ts quando a base
// o criar (auditoria DRG-01, 07/10/2026).
import { registrarReajuste } from "./actions";

export default async function SalarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx } = await abrirTelaDoModulo("dp_colaboradores");
  const canViewBank = await canViewSensitiveField(ctx, "DADOS_BANCARIOS");
  const canViewSalary = await canViewSensitiveField(ctx, "SALARIO");
  if (!canViewBank && !canViewSalary) notFound();

  const prisma = getPrisma();
  const person = await prisma.person.findFirst({
    where: { id, type: "COLABORADOR", ...(await scopedPersonWhere(ctx)) },
    select: {
      id: true, name: true, isInternal: true, currentCompanyId: true, currentSalary: true,
      bankName: true, bankAgency: true, bankAccount: true, bankAccountType: true,
    },
  });
  if (!person) notFound();

  const [salaryHistory, cargosDaEmpresa] = await Promise.all([
    canViewSalary
      ? prisma.salaryChange.findMany({
          where: { tenantId: ctx.tenantId, personId: id },
          orderBy: { effectiveDate: "desc" },
          include: { cargo: { select: { name: true } } },
        })
      : Promise.resolve([]),
    person.currentCompanyId
      ? prisma.cargo.findMany({
          where: { tenantId: ctx.tenantId, companyId: person.currentCompanyId, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const registrarReajusteAction = registrarReajuste.bind(null, id);

  return (
    <PageContainer>
      <PessoaBreadcrumb
        isInternal={person.isInternal}
        personId={id}
        personName={person.name}
        atual="Salário"
      />
      <BackButton className="mb-3" />
      <PageHeader title="Dados Bancários e Salário" />

      {/* Mesma grade de rótulo/valor da ficha (30/09): os cinco dados numa
          linha no desktop, em vez de duas colunas de meia tela. */}
      <Card className="p-5 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-x-8 gap-y-4">
          {canViewSalary && (
            <InfoRow
              label="Salário Atual"
              value={person.currentSalary != null ? formatarReais(Number(person.currentSalary)) : null}
            />
          )}
          {canViewBank && (
            <>
              <InfoRow label="Banco" value={person.bankName} />
              <InfoRow label="Agência" value={person.bankAgency} mono />
              <InfoRow label="Conta" value={person.bankAccount} mono />
              <InfoRow label="Tipo de Conta" value={person.bankAccountType} />
            </>
          )}
        </div>
      </Card>

      {canViewSalary && (
        <SalaryHistorySection
          action={registrarReajusteAction}
          cargos={cargosDaEmpresa}
          history={salaryHistory.map((h) => ({
            id: h.id,
            previousSalary: h.previousSalary?.toString() ?? null,
            newSalary: h.newSalary.toString(),
            changePercent: h.changePercent?.toString() ?? null,
            cargoName: h.cargo?.name ?? null,
            reason: h.reason,
            effectiveDateLabel: formatCalendarDate(h.effectiveDate),
          }))}
        />
      )}
    </PageContainer>
  );
}
