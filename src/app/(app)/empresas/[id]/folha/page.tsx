import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { notFound } from "next/navigation";
import { Wallet } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { PayrollStatus } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { NovaCompetenciaDaFolha } from "@/components/folha/AbrirCompetenciaForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { abrirCompetencia } from "./actions";

const STATUS_LABEL: Record<PayrollStatus, string> = {
  PENDENTE:       "Pendente",
  EM_CONFERENCIA: "Em conferência",
  CONFERIDO:      "Conferido",
  ENVIADO:        "Enviado",
  PROCESSADO:     "Processado",
  CANCELADO:      "Cancelado",
};

// O tom de cada situação, o mesmo do selo do lançamento (`PayrollEntryRow`).
const STATUS_TOM: Record<PayrollStatus, TomDoSelo> = {
  PENDENTE: "neutro",
  EM_CONFERENCIA: "atencao",
  CONFERIDO: "marca",
  ENVIADO: "marca",
  PROCESSADO: "sucesso",
  CANCELADO: "neutro",
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
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: company.name, href: `/empresas/${companyId}?tab=operations`, truncate: true },
          { label: "Folha de pagamento" },
        ]}
      />

      <PageHeader
        title="Folha de pagamento"
        subtitle={`${competencias.length} competência${competencias.length !== 1 ? "s" : ""} — controle e conferência de lançamentos, não motor de cálculo`}
        action={canManage ? <NovaCompetenciaDaFolha action={abrirCompetencia} companyId={companyId} /> : undefined}
      />

      {competencias.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Wallet />}
            title="Nenhuma competência aberta"
            description={canManage ? "Use “+ Nova competência”, no alto da tela, para abrir a primeira e começar a conferir os lançamentos de folha." : "Nenhuma competência de folha foi aberta ainda para esta empresa."}
          />
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {competencias.map((c) => (
            <Link
              key={c.id}
              href={`/empresas/${companyId}/folha/${c.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
            >
              <p className="text-fs-3 text-fg">{MONTH_LABEL[c.month - 1]}/{c.year}</p>
              {/* A situação da competência no `Selo` (15/10/2026): era texto cinza. */}
              <span className="flex items-center gap-2 text-fs-2 text-fg-muted">
                <Selo tom={STATUS_TOM[c.status]}>{STATUS_LABEL[c.status]}</Selo>
                {c._count.entries} lançamento{c._count.entries !== 1 ? "s" : ""}
              </span>
            </Link>
          ))}
        </Card>
      )}
    </PageContainer>
  );
}
