import Link from "next/link";
import { notFound } from "next/navigation";
import { Landmark } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canViewSector, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { saoPauloParts } from "@/lib/agenda";
import { formatInstantDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FiltroDePeriodo, AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";
import { ContaBancariaForm, AlternarContaAtiva } from "@/components/financeiro/conciliacao/ContaBancariaForm";
import { ImportarOfx } from "@/components/financeiro/conciliacao/ImportarOfx";
import { TransacoesDaConta, type LinhaDaTransacao } from "@/components/financeiro/conciliacao/TransacoesDaConta";
import { dataCurta } from "@/components/financeiro/conciliacao/data";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { dataValida } from "@/lib/financeiro/periodo";
import { decimalDeCentavos } from "@/lib/financeiro/manual";
import { moeda, tomDoValor } from "@/lib/financeiro/formato";
import type { SituacaoDoSaldo } from "@/lib/financeiro/conciliacao/saldo";
import { saldosDasContas } from "@/lib/financeiro/conciliacao/saldoDasContas";
import {
  rankearCandidatos,
  sugestaoDaTransacao,
  tipoCompativel,
  type LancamentoCandidato,
  type Motivo,
} from "@/lib/financeiro/conciliacao/casamento";
import { motivoDoBloqueioDeBaixa } from "@/lib/financeiro/aprovacao/regras";
import { ondeDaEmpresa } from "@/lib/financeiro/planoDeContas";

export const dynamic = "force-dynamic";

const MODULE = "bpo_conciliacao";
// Setor que opera o módulo neste tenant (ver `setorDoModulo`); o do catálogo
// é só o padrão.
const SECTOR = getModuleDef(MODULE)!.sectorCode;

const SITUACOES = [
  { chave: "pendentes", rotulo: "Pendentes", status: "PENDENTE" },
  { chave: "conciliadas", rotulo: "Conciliadas", status: "CONCILIADA" },
  { chave: "ignoradas", rotulo: "Ignoradas", status: "IGNORADA" },
  { chave: "todas", rotulo: "Todas", status: null },
] as const;

/** Teto da lista. Acima disso, o período filtra — conciliação é trabalho de semana, não de ano. */
const LIMITE_DE_TRANSACOES = 300;

const MOTIVOS: Record<Motivo, string> = {
  baixa_mesmo_dia: "já baixado no mesmo dia",
  baixa_proxima: "já baixado em data próxima",
  vencimento: "valor e vencimento",
  documento: "CNPJ/CPF no extrato",
  nome: "nome no extrato",
  nome_parcial: "nome parecido",
  fora_da_janela: "mesmo valor",
};

/**
 * Conciliação bancária: o extrato da conta contra os lançamentos da empresa.
 *
 * A tela é por **conta**, não por empresa, porque o extrato é por conta e o
 * saldo que se confere é o dela. A empresa escolhe quais contas aparecem; a
 * conta escolhe o extrato.
 */
export default async function ConciliacaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  const setor = ctx.tenantId ? ((await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR) : SECTOR;
  if (!ctx.tenantId || !canViewSector(ctx, setor)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  const podeAgir = canActOnSector(ctx, setor);
  const tenantId = ctx.tenantId;

  const params = await searchParams;
  const empresas = await empresasDoSeletor(tenantId);
  const companyId = params.empresa && empresas.some((e) => e.id === params.empresa) ? params.empresa : empresas[0]?.id;

  const cabecalho = (
    <PageHeader
      title="Conciliação bancária"
      subtitle="O extrato do banco contra os lançamentos: o que já foi pago, o que falta lançar e se o saldo fecha."
    />
  );

  if (!companyId) {
    return (
      <PageContainer>
        {cabecalho}
        <EmptyState title="Nenhuma empresa ativa" icon={<Landmark />} />
      </PageContainer>
    );
  }

  const prisma = getPrisma();
  const contas = await prisma.bankAccount.findMany({
    where: { tenantId, companyId },
    select: {
      id: true,
      nickname: true,
      bankCode: true,
      agency: true,
      accountNumber: true,
      type: true,
      openingBalance: true,
      openingBalanceDate: true,
      active: true,
      omieAccountLabel: true,
      _count: { select: { transactions: true } },
    },
    orderBy: [{ active: "desc" }, { nickname: "asc" }],
  });

  const saldos = await saldosDasContas(tenantId, contas);

  const conta = contas.find((c) => c.id === params.conta) ?? contas.find((c) => c.active) ?? contas[0] ?? null;

  return (
    <PageContainer>
      {cabecalho}
      <FiltroDePeriodo acao="/conciliacao" empresas={empresas} empresaId={companyId} />

      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="text-[14px] font-semibold text-fg">Contas bancárias</h2>
        {podeAgir && <ContaBancariaForm companyId={companyId} />}
      </div>

      {contas.length === 0 ? (
        <Card className="mb-6">
          <EmptyState
            title="Nenhuma conta bancária cadastrada"
            description="Cadastre a conta com banco, agência e número — é o que confere o extrato OFX na importação."
            icon={<Landmark />}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
          {contas.map((c) => {
            const selecionada = conta?.id === c.id;
            return (
              <Card key={c.id} className={`p-3.5 flex flex-col gap-2 ${selecionada ? "border-brand/60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/conciliacao?empresa=${companyId}&conta=${c.id}`}
                      className="text-[13px] font-semibold text-fg hover:underline"
                      aria-current={selecionada ? "true" : undefined}
                    >
                      {c.nickname}
                    </Link>
                    <span className="block text-[11px] text-fg-muted">
                      Banco {c.bankCode} · {c.agency ? `ag. ${c.agency} · ` : ""}c/{c.type === "POUPANCA" ? "p" : "c"} {c.accountNumber}
                    </span>
                    {c.omieAccountLabel && (
                      <span className="block text-[11px] text-fg-muted" title="O que o BPO conciliar nesta conta no Omie sai da fila daqui">
                        Ligada ao Omie: {c.omieAccountLabel}
                      </span>
                    )}
                  </div>
                  {!c.active && <Badge variant="danger">Inativa</Badge>}
                </div>
                <BlocoDoSaldo situacao={saldos.get(c.id)!} />
                {podeAgir && (
                  <div className="flex items-center gap-3">
                    <ContaBancariaForm
                      companyId={companyId}
                      conta={{
                        id: c.id,
                        nickname: c.nickname,
                        bankCode: c.bankCode,
                        agency: c.agency,
                        accountNumber: c.accountNumber,
                        type: c.type,
                        saldoInicial: c.openingBalance === null ? "" : textoDeCentavos(centavosDeDecimal(c.openingBalance)),
                        saldoInicialKey: c.openingBalanceDate ? saoPauloParts(c.openingBalanceDate).dateKey : "",
                        active: c.active,
                        temTransacoes: c._count.transactions > 0,
                      }}
                    />
                    <AlternarContaAtiva bankAccountId={c.id} ativa={c.active} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {conta && (
        <ExtratoDaConta
          tenantId={tenantId}
          companyId={companyId}
          conta={conta}
          podeAgir={podeAgir}
          params={params}
        />
      )}
    </PageContainer>
  );
}

/** Centavos para o texto que o campo de valor aceita de volta ("-1234,56"). */
function textoDeCentavos(centavos: number): string {
  const abs = Math.abs(centavos);
  return `${centavos < 0 ? "-" : ""}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

function BlocoDoSaldo({ situacao }: { situacao: SituacaoDoSaldo }) {
  const linha = (rotulo: string, valor: React.ReactNode, tom = "") => (
    <div className="flex items-baseline justify-between gap-2 text-[12px]">
      <span className="text-fg-muted">{rotulo}</span>
      <span className={`tabular-nums font-medium ${tom}`}>{valor}</span>
    </div>
  );

  switch (situacao.tipo) {
    case "sem_dados":
      return <p className="text-[12px] text-fg-muted">Sem extrato importado e sem saldo inicial.</p>;
    case "sem_saldo_inicial":
      return (
        <div className="flex flex-col gap-0.5">
          {linha(
            `Saldo do banco${situacao.bancoDataKey ? ` em ${dataCurta(situacao.bancoDataKey)}` : ""}`,
            moeda(situacao.bancoCentavos),
            tomDoValor(situacao.bancoCentavos)
          )}
          <p className="text-[11px] text-fg-muted">Sem saldo inicial cadastrado, não há com que conferir.</p>
        </div>
      );
    case "sem_saldo_do_banco":
      return (
        <div className="flex flex-col gap-0.5">
          {linha("Saldo calculado", moeda(situacao.calculadoCentavos), tomDoValor(situacao.calculadoCentavos))}
          <p className="text-[11px] text-fg-muted">Nenhum extrato importado trouxe o saldo do banco.</p>
        </div>
      );
    case "banco_anterior_ao_inicial":
      return (
        <div className="flex flex-col gap-0.5">
          {linha("Saldo calculado", moeda(situacao.calculadoCentavos), tomDoValor(situacao.calculadoCentavos))}
          <p className="text-[11px] text-fg-muted">
            O saldo do banco mais recente ({dataCurta(situacao.bancoDataKey)}) é anterior ao saldo inicial — importe um
            extrato mais novo para conferir.
          </p>
        </div>
      );
    case "conferido": {
      const data = situacao.bancoDataKey ? ` em ${dataCurta(situacao.bancoDataKey)}` : "";
      return (
        <div className="flex flex-col gap-0.5">
          {linha(`Saldo calculado${data}`, moeda(situacao.calculadoNaDataCentavos), tomDoValor(situacao.calculadoNaDataCentavos))}
          {linha(`Saldo do banco${data}`, moeda(situacao.bancoCentavos), tomDoValor(situacao.bancoCentavos))}
          {situacao.divergenciaCentavos === 0 ? (
            linha("Divergência", "Fecha no centavo", "text-success")
          ) : (
            linha("Divergência", moeda(situacao.divergenciaCentavos), "text-danger")
          )}
          {situacao.calculadoCentavos !== situacao.calculadoNaDataCentavos &&
            linha("Saldo calculado com tudo importado", moeda(situacao.calculadoCentavos), tomDoValor(situacao.calculadoCentavos))}
        </div>
      );
    }
  }
}

async function ExtratoDaConta({
  tenantId,
  companyId,
  conta,
  podeAgir,
  params,
}: {
  tenantId: string;
  companyId: string;
  conta: { id: string; nickname: string; active: boolean };
  podeAgir: boolean;
  params: Record<string, string | undefined>;
}) {
  const prisma = getPrisma();
  const situacao = SITUACOES.find((s) => s.chave === params.situacao) ?? SITUACOES[0];
  const de = dataValida(params.de);
  const ate = dataValida(params.ate);

  const base = `/conciliacao?empresa=${companyId}&conta=${conta.id}${de ? `&de=${de}` : ""}${ate ? `&ate=${ate}` : ""}`;

  const [importacoes, transacoes] = await Promise.all([
    prisma.bankStatementImport.findMany({
      where: { tenantId, bankAccountId: conta.id },
      select: {
        id: true,
        fileName: true,
        periodStart: true,
        periodEnd: true,
        ledgerBalance: true,
        ledgerBalanceAt: true,
        transactionsRead: true,
        transactionsNew: true,
        createdAt: true,
        importedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.bankTransaction.findMany({
      where: {
        tenantId,
        bankAccountId: conta.id,
        ...(situacao.status ? { status: situacao.status } : {}),
        ...(de || ate
          ? {
              postedAt: {
                ...(de ? { gte: new Date(`${de}T00:00:00-03:00`) } : {}),
                ...(ate ? { lte: new Date(`${ate}T23:59:59.999-03:00`) } : {}),
              },
            }
          : {}),
      },
      select: {
        id: true,
        postedAt: true,
        amount: true,
        memo: true,
        payeeName: true,
        status: true,
        reconciledViaOmie: true,
        ignoredReason: true,
        matches: {
          select: {
            financeEntry: {
              select: {
                id: true,
                amount: true,
                dueDate: true,
                paidAt: true,
                description: true,
                counterparty: { select: { name: true } },
              },
            },
          },
        },
      },
      // Pendente mais antiga primeiro: é a que está há mais tempo sem dono.
      orderBy: situacao.chave === "pendentes" ? { postedAt: "asc" } : { postedAt: "desc" },
      take: LIMITE_DE_TRANSACOES + 1,
    }),
  ]);

  const limitado = transacoes.length > LIMITE_DE_TRANSACOES;
  const visiveis = transacoes.slice(0, LIMITE_DE_TRANSACOES);
  const pendentes = visiveis.filter((t) => t.status === "PENDENTE");

  // Candidatos de valor exato para as pendentes da tela, numa consulta só.
  const candidatos = pendentes.length && podeAgir ? await candidatosDaEmpresa(tenantId, companyId, pendentes) : [];
  const descricoes = new Map(candidatos.map((c) => [c.id, c.descricao]));

  const linhas: LinhaDaTransacao[] = visiveis.map((t) => {
    const centavos = centavosDeDecimal(t.amount);
    const dataKey = saoPauloParts(t.postedAt).dateKey;
    let sugestao: LinhaDaTransacao["sugestao"] = null;
    let candidatosDeMesmoValor = 0;
    let travadosDeMesmoValor = 0;
    if (t.status === "PENDENTE") {
      const ranking = rankearCandidatos({ centavos, dataKey, memo: t.memo, nome: t.payeeName }, candidatos);
      candidatosDeMesmoValor = ranking.length;
      travadosDeMesmoValor = ranking.filter((c) => c.lancamento.bloqueioDeBaixa).length;
      const forte = sugestaoDaTransacao(ranking);
      if (forte) {
        const l = forte.candidato.lancamento;
        sugestao = {
          id: l.id,
          contraparteNome: l.contraparteNome,
          descricao: descricoes.get(l.id) ?? null,
          centavos: l.centavos,
          vencimentoKey: l.vencimentoKey,
          pagoEmKey: l.pagoEmKey,
          motivo: forte.candidato.motivos.map((m) => MOTIVOS[m]).join(" · "),
          bloqueio: forte.bloqueio,
        };
      }
    }
    return {
      id: t.id,
      dataKey,
      centavos,
      memo: t.memo,
      nome: t.payeeName,
      status: t.status,
      viaOmie: t.reconciledViaOmie,
      ignoredReason: t.ignoredReason,
      sugestao,
      candidatosDeMesmoValor,
      travadosDeMesmoValor,
      vinculados: t.matches.map((m) => ({
        id: m.financeEntry.id,
        contraparteNome: m.financeEntry.counterparty.name,
        descricao: m.financeEntry.description,
        centavos: centavosDeDecimal(m.financeEntry.amount),
        vencimentoKey: saoPauloParts(m.financeEntry.dueDate).dateKey,
        pagoEmKey: m.financeEntry.paidAt ? saoPauloParts(m.financeEntry.paidAt).dateKey : null,
      })),
    };
  });

  const [contrapartes, categorias, centros] =
    podeAgir && pendentes.length > 0
      ? await Promise.all([
          prisma.financeCounterparty.findMany({
            where: { tenantId, companyId, active: true },
            select: { id: true, name: true, document: true, defaultCategoryId: true, defaultCostCenterId: true },
            orderBy: { name: "asc" },
          }),
          prisma.financeCategory.findMany({
            where: ondeDaEmpresa(tenantId, companyId),
            select: { id: true, name: true, kind: true },
            orderBy: { name: "asc" },
          }),
          prisma.costCenter.findMany({
            where: { tenantId, companyId, active: true },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
        ])
      : [[], [], []];

  return (
    <>
      <h2 className="text-[14px] font-semibold text-fg mb-3">Extrato — {conta.nickname}</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
        {podeAgir && conta.active ? (
          <ImportarOfx bankAccountId={conta.id} />
        ) : (
          <Card className="p-4 text-[12px] text-fg-muted">
            {conta.active ? "Sem permissão para importar extrato." : "Conta inativa: reative para importar extrato."}
          </Card>
        )}
        <Card className="p-4 flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold text-fg">Importações recentes</h3>
          {importacoes.length === 0 ? (
            <p className="text-[12px] text-fg-muted">Nenhum extrato importado nesta conta.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-[12px]">
              {importacoes.map((i) => (
                <li key={i.id} className="flex flex-col border-b border-border-soft pb-1.5 last:border-0">
                  <span className="text-fg truncate" title={i.fileName}>
                    {i.fileName}
                  </span>
                  <span className="text-[11px] text-fg-muted">
                    {formatInstantDateTime(i.createdAt, { dateStyle: "short", timeStyle: "short" })}
                    {i.importedBy ? ` · ${i.importedBy.name}` : ""} · {i.transactionsNew} novas de {i.transactionsRead}
                    {i.periodStart && i.periodEnd
                      ? ` · ${dataCurta(saoPauloParts(i.periodStart).dateKey)} a ${dataCurta(saoPauloParts(i.periodEnd).dateKey)}`
                      : ""}
                    {i.ledgerBalance !== null ? ` · saldo ${moeda(centavosDeDecimal(i.ledgerBalance))}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <AbasDeLink
        abas={SITUACOES.map((s) => ({ chave: s.chave, rotulo: s.rotulo, href: `${base}&situacao=${s.chave}` }))}
        ativa={situacao.chave}
      />

      <form method="get" action="/conciliacao" className="flex flex-wrap items-center gap-2 mb-4">
        <input type="hidden" name="empresa" value={companyId} />
        <input type="hidden" name="conta" value={conta.id} />
        <input type="hidden" name="situacao" value={situacao.chave} />
        <Input compact type="date" name="de" defaultValue={de ?? ""} className="w-40" aria-label="De" />
        <span className="text-[12px] text-fg-muted">a</span>
        <Input compact type="date" name="ate" defaultValue={ate ?? ""} className="w-40" aria-label="Até" />
        <Button type="submit" variant="secondary" size="sm">
          Filtrar período
        </Button>
        {(de || ate) && (
          <Link href={`/conciliacao?empresa=${companyId}&conta=${conta.id}&situacao=${situacao.chave}`} className="text-[12px] text-fg-muted hover:text-fg">
            Limpar
          </Link>
        )}
      </form>

      {linhas.length === 0 ? (
        <EmptyState
          title={situacao.chave === "pendentes" ? "Nada pendente" : "Nenhuma transação"}
          description={
            situacao.chave === "pendentes"
              ? "Toda transação importada neste período está conciliada ou ignorada."
              : "Nenhuma transação nesta situação e período."
          }
          icon={<Landmark />}
        />
      ) : (
        <>
          <TransacoesDaConta
            linhas={linhas}
            podeAgir={podeAgir}
            contrapartes={contrapartes.map((c) => ({
              id: c.id,
              nome: c.name,
              documento: c.document,
              defaultCategoryId: c.defaultCategoryId,
              defaultCostCenterId: c.defaultCostCenterId,
            }))}
            categorias={categorias.map((c) => ({ id: c.id, nome: c.name, kind: c.kind }))}
            centros={centros.map((c) => ({ id: c.id, nome: c.name }))}
          />
          {limitado && (
            <p className="text-[11px] text-fg-muted mt-2">
              Mostrando as {LIMITE_DE_TRANSACOES} primeiras. Use o período para ver as demais.
            </p>
          )}
        </>
      )}
      <p className="text-[11px] text-fg-muted mt-3">
        A sugestão aparece só quando um lançamento de mesmo valor se destaca pela data e pelo nome — nada é conciliado
        sem confirmação. Conciliar marca os lançamentos como pagos na data do extrato; desfazer devolve o estado anterior.
        Em conta ligada ao Omie, a linha que bate no valor e no dia com uma única baixa já conciliada lá sai da fila
        sozinha, como “Conciliada no Omie”.
      </p>
    </>
  );
}

/**
 * Lançamentos da empresa que podem casar com as pendentes da tela: tipo
 * compatível, não cancelados, sem vínculo e de valor igual ao de alguma delas.
 */
async function candidatosDaEmpresa(
  tenantId: string,
  companyId: string,
  pendentes: { amount: { toString(): string } }[]
): Promise<(LancamentoCandidato & { descricao: string | null })[]> {
  const valores = [...new Set(pendentes.map((p) => centavosDeDecimal(p.amount)))];
  const tipos = [...new Set(valores.map(tipoCompativel).filter((k): k is "PAGAR" | "RECEBER" => k !== null))];
  const absolutos = [...new Set(valores.map((v) => Math.abs(v)).filter((v) => v > 0))];
  if (absolutos.length === 0) return [];

  const prisma = getPrisma();
  const linhas = await prisma.financeEntry.findMany({
    where: {
      tenantId,
      companyId,
      kind: { in: tipos },
      status: { not: "CANCELADO" },
      bankMatch: { is: null },
      amount: { in: absolutos.map(decimalDeCentavos) },
    },
    select: {
      id: true,
      kind: true,
      status: true,
      amount: true,
      dueDate: true,
      paidAt: true,
      description: true,
      approvalStatus: true,
      counterparty: { select: { name: true, document: true } },
    },
    take: 2_000,
  });
  return linhas.map((l) => {
    return {
      id: l.id,
      descricao: l.description,
      kind: l.kind,
      status: l.status,
      centavos: centavosDeDecimal(l.amount),
      vencimentoKey: saoPauloParts(l.dueDate).dateKey,
      pagoEmKey: l.paidAt ? saoPauloParts(l.paidAt).dateKey : null,
      contraparteNome: l.counterparty.name,
      contraparteDocumento: l.counterparty.document,
      conciliado: false,
      // A mesma frase que a action devolve ao confirmar — só que antes do clique.
      bloqueioDeBaixa: motivoDoBloqueioDeBaixa(l),
    };
  });
}
