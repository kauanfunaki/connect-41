import { notFound } from "next/navigation";
import { NotebookPen } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canViewSector, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { saoPauloParts } from "@/lib/agenda";
import { formatInstantDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { FiltroDePeriodo, AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";
import { FormLancamentoManual } from "@/components/financeiro/FormLancamentoManual";
import { ImportarLancamentosCsv } from "@/components/financeiro/ImportarLancamentosCsv";
import { CancelarLancamento } from "@/components/financeiro/CancelarLancamento";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { competenciaValida, competenciaDoInstante } from "@/lib/financeiro/periodo";
import { podeCancelarManual } from "@/lib/financeiro/manual";
import { moeda } from "@/lib/financeiro/formato";
import { centrosAtivosDaEmpresa } from "@/lib/financeiro/centroDeCustoServidor";

export const dynamic = "force-dynamic";

const MODULE = "bpo_lancamentos";
// Setor que opera o módulo neste tenant (ver `setorDoModulo`); o do catálogo
// é só o padrão.
const SECTOR = getModuleDef(MODULE)!.sectorCode;

const ABAS = [
  { chave: "lista", rotulo: "Lançados à mão" },
  { chave: "novo", rotulo: "Novo lançamento" },
  { chave: "importar", rotulo: "Importar CSV" },
] as const;

const STATUS: Record<string, { rotulo: string; variante: "success" | "warning" | "danger" | "info" }> = {
  PROVISORIO: { rotulo: "A conferir", variante: "warning" },
  CONFERIDO: { rotulo: "Em aberto", variante: "info" },
  PAGO: { rotulo: "Liquidado", variante: "success" },
  CANCELADO: { rotulo: "Cancelado", variante: "danger" },
};

/**
 * Lançamentos que não nascem de nota: aluguel, folha, pró-labore, tarifa,
 * contrato sem nota. A outra porta de entrada do financeiro.
 *
 * A lista mostra só o que entrou por aqui (`fiscalDocumentId` nulo). O que veio
 * de nota continua em `/pagar` e `/receber`, que são as donas das contas —
 * inclusive destes, que aparecem lá também.
 */
export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canViewSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const params = await searchParams;
  const aba = ABAS.find((a) => a.chave === params.aba)?.chave ?? "lista";
  const podeLancar = canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR);
  const agora = new Date();
  const hojeKey = saoPauloParts(agora).dateKey;
  const mes = competenciaValida(params.mes) ?? competenciaDoInstante(agora);

  const empresas = await empresasDoSeletor(ctx.tenantId);
  const companyId = params.empresa && empresas.some((e) => e.id === params.empresa) ? params.empresa : empresas[0]?.id;

  const cabecalho = (
    <PageHeader
      title="Lançamentos"
      subtitle="Contas que não nascem de nota fiscal — lançadas à mão ou importadas de planilha."
    />
  );

  if (!companyId) {
    return (
      <PageContainer>
        {cabecalho}
        <EmptyState title="Nenhuma empresa ativa" icon={<NotebookPen />} />
      </PageContainer>
    );
  }

  const href = (chave: string) => `/lancamentos?empresa=${companyId}&mes=${mes}${chave === "lista" ? "" : `&aba=${chave}`}`;
  const abas = ABAS.filter((a) => a.chave === "lista" || podeLancar).map((a) => ({ ...a, href: href(a.chave) }));

  const prisma = getPrisma();

  return (
    <PageContainer>
      {cabecalho}
      <FiltroDePeriodo
        acao="/lancamentos"
        empresas={empresas}
        empresaId={companyId}
        mes={aba === "lista" ? mes : undefined}
        extras={{ aba: aba === "lista" ? undefined : aba }}
      />
      <AbasDeLink abas={abas} ativa={aba} />

      {aba === "novo" && podeLancar && (
        <FormularioDaEmpresa companyId={companyId} tenantId={ctx.tenantId} hojeKey={hojeKey} mes={mes} />
      )}

      {aba === "importar" && podeLancar && <ImportarLancamentosCsv companyId={companyId} />}

      {aba === "lista" && (
        <ListaDeManuais
          prisma={prisma}
          tenantId={ctx.tenantId}
          companyId={companyId}
          mes={mes}
          podeCancelar={podeLancar}
        />
      )}
    </PageContainer>
  );
}

async function FormularioDaEmpresa({
  companyId,
  tenantId,
  hojeKey,
  mes,
}: {
  companyId: string;
  tenantId: string;
  hojeKey: string;
  mes: string;
}) {
  const prisma = getPrisma();
  const [contrapartes, categorias, centros] = await Promise.all([
    prisma.financeCounterparty.findMany({
      where: { tenantId, companyId, active: true },
      select: { id: true, name: true, document: true, defaultCategoryId: true, defaultCostCenterId: true },
      orderBy: { name: "asc" },
    }),
    prisma.financeCategory.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true, kind: true },
      orderBy: { name: "asc" },
    }),
    centrosAtivosDaEmpresa(tenantId, companyId),
  ]);
  return (
    <FormLancamentoManual
      companyId={companyId}
      hojeISO={hojeKey}
      competenciaPadrao={mes}
      contrapartes={contrapartes.map((c) => ({
        id: c.id,
        nome: c.name,
        documento: c.document,
        defaultCategoryId: c.defaultCategoryId,
        defaultCostCenterId: c.defaultCostCenterId,
      }))}
      centros={centros}
      categorias={categorias.map((c) => ({ id: c.id, nome: c.name, kind: c.kind }))}
    />
  );
}

async function ListaDeManuais({
  prisma,
  tenantId,
  companyId,
  mes,
  podeCancelar,
}: {
  prisma: ReturnType<typeof getPrisma>;
  tenantId: string;
  companyId: string;
  mes: string;
  podeCancelar: boolean;
}) {
  const linhas = await prisma.financeEntry.findMany({
    where: { tenantId, companyId, competence: mes, fiscalDocumentId: null },
    select: {
      id: true,
      kind: true,
      status: true,
      amount: true,
      dueDate: true,
      paidAt: true,
      description: true,
      fiscalDocumentId: true,
      closeReason: true,
      agreementId: true,
      counterparty: { select: { name: true } },
      category: { select: { name: true } },
      costCenter: { select: { name: true } },
    },
    orderBy: { dueDate: "asc" },
    take: 500,
  });

  if (linhas.length === 0) {
    return (
      <EmptyState
        title="Nenhum lançamento manual nesta competência"
        description="Use “Novo lançamento” para registrar uma conta sem nota, ou importe uma planilha."
        icon={<NotebookPen />}
      />
    );
  }

  // Renegociado e perda são cancelamentos com nome: a dívida seguiu num acordo,
  // ou alguém decidiu dar por perdida — "cancelado" diria outra coisa.
  const statusDe = (l: (typeof linhas)[number]) =>
    l.closeReason === "RENEGOCIADO"
      ? { rotulo: "Renegociado", variante: "info" as const }
      : l.closeReason === "PERDA"
        ? { rotulo: "Perda", variante: "danger" as const }
        : STATUS[l.status]!;

  return (
    <>
      <CartoesNoCelular>
        {linhas.map((l) => {
          const status = statusDe(l);
          return (
            <Cartao key={l.id}>
              <TopoDoCartao nome={l.counterparty.name} valor={moeda(centavosDeDecimal(l.amount))} />
              {l.description && <InfoDoCartao>{l.description}</InfoDoCartao>}
              <InfoDoCartao className="mt-1 tabular-nums">
                vence {formatInstantDate(l.dueDate)}
                {l.paidAt && ` · liquidado em ${formatInstantDate(l.paidAt)}`}
              </InfoDoCartao>
              <InfoDoCartao>
                {l.category?.name ?? "sem categoria"}
                {l.costCenter?.name ? ` · ${l.costCenter.name}` : ""}
              </InfoDoCartao>
              <PeDoCartao>
                <span className={`text-[12px] font-medium ${l.kind === "PAGAR" ? "text-danger" : "text-success"}`}>
                  {l.kind === "PAGAR" ? "A pagar" : "A receber"}
                </span>
                <Badge variant={status.variante}>{status.rotulo}</Badge>
                {podeCancelar && podeCancelarManual(l).pode && (
                  <span className="ml-auto">
                    <CancelarLancamento entryId={l.id} />
                  </span>
                )}
              </PeDoCartao>
            </Cartao>
          );
        })}
      </CartoesNoCelular>

      <TabelaNoDesktop>
      <table className="w-full min-w-[880px] text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
            <th className="py-2 pr-3 font-medium">Tipo</th>
            <th className="py-2 pr-3 font-medium">Contraparte</th>
            <th className="py-2 pr-3 font-medium">Categoria</th>
            <th className="py-2 pr-3 font-medium">Centro de custo</th>
            <th className="py-2 pr-3 font-medium">Vencimento</th>
            <th className="py-2 pr-3 font-medium text-right">Valor</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const status = statusDe(l);
            return (
              <tr key={l.id} className="border-b border-border-soft hover:bg-surface-hover transition-colors">
                <td className={`py-2.5 pr-3 text-[12px] font-medium ${l.kind === "PAGAR" ? "text-danger" : "text-success"}`}>
                  {l.kind === "PAGAR" ? "A pagar" : "A receber"}
                </td>
                <td className="py-2.5 pr-3">
                  <span className="font-medium">{l.counterparty.name}</span>
                  {l.description && <span className="block text-[11px] text-fg-muted truncate max-w-[260px]">{l.description}</span>}
                </td>
                <td className="py-2.5 pr-3 text-fg-secondary">{l.category?.name ?? "—"}</td>
                <td className="py-2.5 pr-3 text-fg-secondary">{l.costCenter?.name ?? "—"}</td>
                <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">
                  {formatInstantDate(l.dueDate)}
                  {l.paidAt && <span className="block text-[11px] text-fg-muted">liquidado em {formatInstantDate(l.paidAt)}</span>}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums font-medium">{moeda(centavosDeDecimal(l.amount))}</td>
                <td className="py-2.5 pr-3">
                  <Badge variant={status.variante}>{status.rotulo}</Badge>
                </td>
                <td className="py-2.5">
                  {podeCancelar && podeCancelarManual(l).pode && <CancelarLancamento entryId={l.id} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </TabelaNoDesktop>
      <p className="text-[11px] text-fg-muted mt-3">
        Lançamento não é apagado: cancelar tira dos totais e fica no histórico de auditoria. A baixa de um lançamento
        em aberto é feita em Contas a pagar ou a receber, como a de qualquer conta.
      </p>
    </>
  );
}
