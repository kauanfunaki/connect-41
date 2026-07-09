import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { getAuthContext } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { SalaryHistorySection } from "@/components/pessoas/SalaryHistorySection";
import { registrarReajuste } from "./actions";

export default async function SalarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  const canViewBank = await canViewSensitiveField(ctx, "DADOS_BANCARIOS");
  const canViewSalary = await canViewSensitiveField(ctx, "SALARIO");
  if (!canViewBank && !canViewSalary) notFound();

  const prisma = getPrisma();
  const person = await prisma.person.findFirst({
    where: { id, type: "COLABORADOR", ...(await scopedPersonWhere(ctx)) },
    select: {
      id: true, name: true, currentCompanyId: true, currentSalary: true,
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
      <div className="flex items-center gap-2 mb-6">
        <Link href="/pessoas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Pessoas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/pessoas/${id}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">
          {person.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Salário</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Dados Bancários e Salário</h1>

      <div className="bg-surface border border-border rounded-lg p-5 mb-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {canViewSalary && (
            <InfoRow
              label="Salário Atual"
              value={person.currentSalary != null ? `R$ ${person.currentSalary.toString()}` : null}
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
      </div>

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
            effectiveDateLabel: h.effectiveDate.toLocaleDateString("pt-BR"),
          }))}
        />
      )}
    </PageContainer>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-fg-muted mb-0.5">{label}</p>
      <p className={`text-[13px] text-fg ${mono ? "tnum" : ""}`}>{value ?? "—"}</p>
    </div>
  );
}
