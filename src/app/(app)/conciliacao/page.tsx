import Link from "next/link";
import { notFound } from "next/navigation";
import { Landmark, History } from "lucide-react";
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
import { StatusDot } from "@/components/shared/StatusDot";
import { CampoPeriodo } from "@/components/ui/CampoPeriodo";
import { Button } from "@/components/ui/Button";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { EmpresaDaTela } from "@/components/empresas/EmpresaDaTela";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
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
  nivelDoCasamento,
  type CandidatoPontuado,
  tipoCompativel,
  type LancamentoCandidato,
  type Motivo,
} from "@/lib/financeiro/conciliacao/casamento";
import { motivoDoBloqueioDeBaixa } from "@/lib/financeiro/aprovacao/regras";
import { saldoEmAberto } from "@/lib/financeiro/baixa/regras";
import { ondeDaEmpresa } from "@/lib/financeiro/planoDeContas";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";

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
  // A empresa da URL, a última aberta pela pessoa — ou nenhuma, e a tela pede
  // (13/10/2026). Era a primeira em ordem alfabética: conciliar, cadastrar
  // conta e importar OFX gravavam nela sem ninguém ter escolhido.
  const empresas = await empresasDoSeletor(tenantId);
  const { escolha, empresa } = await escolherEmpresaDaTela(ctx, params.empresa, empresas);
  const companyId = empresa?.id ?? null;

  const cabecalho = (
    <PageHeader
      title="Conciliação bancária"
      subtitle="O extrato do banco contra os lançamentos: o que já foi pago, o que falta lançar e se o saldo fecha."
    />
  );

  // Trocar de empresa não leva a conta escolhida: a conta é de uma empresa só.
  const filtroDaEmpresa = <FiltroDaEmpresa acao="/conciliacao" empresas={empresas} valor={companyId} />;

  if (!empresa || !companyId) {
    return (
      <PageContainer>
        {cabecalho}
        {empresas.length === 0 ? (
          <EmptyState title="Nenhuma empresa ativa" icon={<Landmark />} />
        ) : (
          <>
            {filtroDaEmpresa}
            <EscolhaAEmpresa escolha={escolha} porQue="O extrato, as contas bancárias e os lançamentos conferidos são de uma empresa por vez." />
          </>
        )}
      </PageContainer>
    );
  }

  // Todo formulário desta tela grava na empresa escolhida — o rodapé diz qual.
  const comEmpresa = (tela: React.ReactNode) => (
    <EmpresaDaTela empresa={{ nome: empresa.nome, cnpj: empresa.cnpj }}>{tela}</EmpresaDaTela>
  );

  const prisma = getPrisma();
  const contas = await prisma.bankAccount.findMany({
    // A conta de adiantamento (lote D, 20/10) não tem extrato: mora em Contas a pagar e a receber.
    where: { tenantId, companyId, type: { notIn: ["ADIANTAMENTO_FORNECEDOR", "ADIANTAMENTO_CLIENTE"] } },
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

  return comEmpresa(
    <PageContainer>
      {/* "Nova conta" é da empresa toda: vai no cabeçalho da tela, como em
          pendências e no resto do app (08/10/2026) — ficava ao lado do h2. */}
      <PageHeader
        title="Conciliação bancária"
        subtitle="O extrato do banco contra os lançamentos: o que já foi pago, o que falta lançar e se o saldo fecha."
        action={podeAgir ? <ContaBancariaForm companyId={companyId} /> : undefined}
      />
      {filtroDaEmpresa}

      <h2 className="text-section font-semibold text-fg mb-3">Contas bancárias</h2>

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
              <Card key={c.id} className={`p-4 flex flex-col gap-2 min-w-0 ${selecionada ? "border-brand/60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/conciliacao?empresa=${companyId}&conta=${c.id}`}
                      className="text-ui font-semibold text-fg hover:underline"
                      aria-current={selecionada ? "true" : undefined}
                    >
                      {c.nickname}
                    </Link>
                    <span className="block text-micro text-fg-muted">
                      Banco {c.bankCode} · {c.agency ? `ag. ${c.agency} · ` : ""}c/{c.type === "POUPANCA" ? "p" : "c"} {c.accountNumber}
                    </span>
                    {c.omieAccountLabel && (
                      <span className="block text-micro text-fg-muted" title="O que o BPO conciliar nesta conta no Omie sai da fila daqui">
                        Ligada ao Omie: {c.omieAccountLabel}
                      </span>
                    )}
                  </div>
                  {/* Ativo/inativo de cadastro é a bolinha (escolha 2A, 08/10/2026). */}
                  {!c.active && <StatusDot color="var(--c41-fg-muted)" label="Inativa" className="flex-shrink-0" />}
                </div>
                <BlocoDoSaldo situacao={saldos.get(c.id)!} />
                {/* mt-auto: os botões ficam no pé do cartão, na mesma altura
                    em todos da linha, tenha o saldo uma linha ou quatro. */}
                {podeAgir && (
                  <div className="mt-auto flex items-center gap-2 pt-1">
                    <ContaBancariaForm
                      companyId={companyId}
                      conta={{
                        id: c.id,
                        nickname: c.nickname,
                        bankCode: c.bankCode,
                        agency: c.agency,
                        accountNumber: c.accountNumber,
                        // A consulta deixa a conta de adiantamento de fora: aqui só há banco.
                        type: c.type === "POUPANCA" ? "POUPANCA" : "CORRENTE",
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
          // As outras contas ativas da empresa — o destino (ou a origem) de uma transferência.
          outrasContas={contas.filter((c) => c.active && c.id !== conta.id).map((c) => ({ id: c.id, nome: `${c.nickname} ${c.accountNumber}` }))}
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
    <div className="flex items-baseline justify-between gap-2 text-fs-2">
      <span className="text-fg-muted">{rotulo}</span>
      <span className={`tabular-nums font-medium ${tom}`}>{valor}</span>
    </div>
  );

  switch (situacao.tipo) {
    case "sem_dados":
      return <p className="text-helper text-fg-muted">Sem extrato importado e sem saldo inicial.</p>;
    case "sem_saldo_inicial":
      return (
        <div className="flex flex-col gap-0.5">
          {linha(
            `Saldo do banco${situacao.bancoDataKey ? ` em ${dataCurta(situacao.bancoDataKey)}` : ""}`,
            moeda(situacao.bancoCentavos),
            tomDoValor(situacao.bancoCentavos)
          )}
          <p className="text-micro text-fg-muted">Sem saldo inicial cadastrado, não há com que conferir.</p>
        </div>
      );
    case "sem_saldo_do_banco":
      return (
        <div className="flex flex-col gap-0.5">
          {linha("Saldo calculado", moeda(situacao.calculadoCentavos), tomDoValor(situacao.calculadoCentavos))}
          <p className="text-micro text-fg-muted">Nenhum extrato importado trouxe o saldo do banco.</p>
        </div>
      );
    case "banco_anterior_ao_inicial":
      return (
        <div className="flex flex-col gap-0.5">
          {linha("Saldo calculado", moeda(situacao.calculadoCentavos), tomDoValor(situacao.calculadoCentavos))}
          <p className="text-micro text-fg-muted">
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
            linha("Divergência", "Fecha no centavo", "text-success-fg")
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
  outrasContas,
  podeAgir,
  params,
}: {
  tenantId: string;
  companyId: string;
  conta: { id: string; nickname: string; active: boolean };
  outrasContas: { id: string; nome: string }[];
  podeAgir: boolean;
  params: Record<string, string | undefined>;
}) {
  const prisma = getPrisma();
  const situacao = SITUACOES.find((s) => s.chave === params.situacao) ?? SITUACOES[0];
  const de = dataValida(params.de);
  const ate = dataValida(params.ate);


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
                transferId: true,
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

  // O candidato como a linha o mostra — o da sugestão forte e o "mais
  // provável" das torres (19/10) têm a mesma forma.
  const resumoDoCandidato = (c: CandidatoPontuado) => ({
    id: c.lancamento.id,
    contraparteNome: c.lancamento.contraparteNome,
    descricao: descricoes.get(c.lancamento.id) ?? null,
    centavos: c.lancamento.centavos,
    vencimentoKey: c.lancamento.vencimentoKey,
    pagoEmKey: c.lancamento.pagoEmKey,
    motivo: c.motivos.map((m) => MOTIVOS[m]).join(" · "),
    bloqueio: c.lancamento.bloqueioDeBaixa ?? null,
  });

  const linhas: LinhaDaTransacao[] = visiveis.map((t) => {
    const centavos = centavosDeDecimal(t.amount);
    const dataKey = saoPauloParts(t.postedAt).dateKey;
    let sugestao: LinhaDaTransacao["sugestao"] = null;
    let provavel: LinhaDaTransacao["provavel"] = null;
    let nivel: LinhaDaTransacao["nivel"] = null;
    let candidatosDeMesmoValor = 0;
    let travadosDeMesmoValor = 0;
    if (t.status === "PENDENTE") {
      const ranking = rankearCandidatos({ centavos, dataKey, memo: t.memo, nome: t.payeeName }, candidatos);
      candidatosDeMesmoValor = ranking.length;
      travadosDeMesmoValor = ranking.filter((c) => c.lancamento.bloqueioDeBaixa).length;
      const forte = sugestaoDaTransacao(ranking);
      if (forte) sugestao = { ...resumoDoCandidato(forte.candidato), bloqueio: forte.bloqueio };
      const casamento = nivelDoCasamento(ranking);
      nivel = casamento.nivel;
      if (!forte && casamento.destaque) provavel = resumoDoCandidato(casamento.destaque);
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
      provavel,
      nivel,
      candidatosDeMesmoValor,
      travadosDeMesmoValor,
      transferencia: t.matches.some((m) => m.financeEntry.transferId !== null),
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

  const [contrapartes, categorias, centros, projetos] =
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
          prisma.financeProject.findMany({
            where: { tenantId, companyId, active: true },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
        ])
      : [[], [], [], []];

  return (
    <>
      <h2 className="text-section font-semibold text-fg mb-3">Extrato — {conta.nickname}</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
        {podeAgir && conta.active ? (
          <ImportarOfx bankAccountId={conta.id} />
        ) : (
          <Card className="p-4 text-fs-2 text-fg-muted">
            {conta.active ? "Sem permissão para importar extrato." : "Conta inativa: reative para importar extrato."}
          </Card>
        )}
        <Card className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <History size={16} className="text-brand" />
            <h3 className="text-card-title font-semibold text-fg">Importações recentes</h3>
          </div>
          {importacoes.length === 0 ? (
            <p className="text-helper text-fg-muted">Nenhum extrato importado nesta conta.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-fs-2">
              {importacoes.map((i) => (
                <li key={i.id} className="flex flex-col border-b border-border-soft pb-1.5 last:border-0">
                  <span className="text-fg truncate" title={i.fileName}>
                    {i.fileName}
                  </span>
                  <span className="text-micro text-fg-muted">
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

      {/* Situação no botão "Filtros"; o período fica ao lado, porque data se
          digita — não se escolhe numa lista (conferência de 30/09). */}
      <CascoDaTabela
        contagem={contarItens(linhas.length, "transação", "transações", limitado)}
        filtros={
          <FiltrosDaTela
            naBarra
            campos={[
              {
                chave: "situacao",
                rotulo: "Situação",
                vazioLabel: "Pendentes",
                opcoes: SITUACOES.filter((s) => s.chave !== "pendentes").map((s) => ({ value: s.chave, label: s.rotulo })),
              },
            ]}
          />
        }
        acoes={
          <form method="get" action="/conciliacao" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="empresa" value={companyId} />
            <input type="hidden" name="conta" value={conta.id} />
            {situacao.chave !== "pendentes" && <input type="hidden" name="situacao" value={situacao.chave} />}
            <CampoPeriodo compact nomeDe="de" nomeAte="ate" defaultDe={de ?? ""} defaultAte={ate ?? ""} className="w-72 max-w-full" />
            {/* "Aplicar", como os outros filtros por formulário (08/10/2026). */}
            <Button type="submit" variant="secondary" size="sm">
              Aplicar
            </Button>
            {(de || ate) && (
              <Button
                href={`/conciliacao?empresa=${companyId}&conta=${conta.id}${situacao.chave !== "pendentes" ? `&situacao=${situacao.chave}` : ""}`}
                variant="ghost"
                size="sm"
              >
                Limpar período
              </Button>
            )}
          </form>
        }
      >

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
              projetos={projetos.map((p) => ({ id: p.id, nome: p.name }))}
              companyId={companyId}
              outrasContas={outrasContas}
            />
            {limitado && (
              <p className="text-micro text-fg-muted mt-2">
                Mostrando as {LIMITE_DE_TRANSACOES} primeiras. Use o período para ver as demais.
              </p>
            )}
          </>
        )}
      </CascoDaTabela>
      <NotaDeFonte>
        A sugestão aparece só quando um lançamento de mesmo valor se destaca pela data e pelo nome — nada é conciliado
        sem confirmação. Conciliar marca os lançamentos como pagos na data do extrato; desfazer devolve o estado anterior.
        Em conta ligada ao Omie, a linha que bate no valor e no dia com uma única baixa já conciliada lá sai da fila
        sozinha, como “Conciliada no Omie”.
      </NotaDeFonte>
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
  const valoresExatos = absolutos.map(decimalDeCentavos);
  // Duas fontes (lote C, 19/10): a conta em aberto, pelo saldo — conciliar
  // quita —, e a baixa já feita sem extrato, pelo total que andou. A conta com
  // baixa parcial entra pelo saldo, que pode não ser o valor dela: por isso o
  // `paidPrincipal > 0`, e o saldo é conferido aqui embaixo.
  const [contas, baixas] = await Promise.all([
    prisma.financeEntry.findMany({
      where: {
        tenantId,
        companyId,
        kind: { in: tipos },
        paidAt: null,
        status: { notIn: ["CANCELADO", "PAGO"] },
        OR: [{ amount: { in: valoresExatos } }, { paidPrincipal: { gt: 0 } }],
      },
      select: {
        id: true,
        kind: true,
        status: true,
        amount: true,
        paidPrincipal: true,
        dueDate: true,
        description: true,
        approvalStatus: true,
        counterparty: { select: { name: true, document: true } },
      },
      take: 2_000,
    }),
    prisma.financeEntryPayment.findMany({
      where: {
        tenantId,
        companyId,
        bankMatch: { is: null },
        cash: { in: valoresExatos },
        entry: { kind: { in: tipos }, status: { not: "CANCELADO" } },
        // A baixa pela conta de adiantamento não passou pelo banco: não casa com o extrato.
        OR: [{ bankAccountId: null }, { bankAccount: { type: { notIn: ["ADIANTAMENTO_FORNECEDOR", "ADIANTAMENTO_CLIENTE"] } } }],
      },
      select: {
        id: true,
        cash: true,
        paidAt: true,
        entry: { select: { kind: true, status: true, dueDate: true, description: true, counterparty: { select: { name: true, document: true } } } },
      },
      take: 2_000,
    }),
  ]);
  return [
    ...contas.map((l) => ({
      id: l.id,
      descricao: l.description,
      kind: l.kind,
      status: l.status,
      centavos: saldoEmAberto(centavosDeDecimal(l.amount), centavosDeDecimal(l.paidPrincipal)),
      vencimentoKey: saoPauloParts(l.dueDate).dateKey,
      pagoEmKey: null,
      contraparteNome: l.counterparty.name,
      contraparteDocumento: l.counterparty.document,
      conciliado: false,
      // A mesma frase que a action devolve ao confirmar — só que antes do clique.
      bloqueioDeBaixa: motivoDoBloqueioDeBaixa(l),
    })),
    ...baixas.map((b) => ({
      // O prefixo diz à action que é uma baixa, e não a conta (`PREFIXO_DA_BAIXA`).
      id: `baixa:${b.id}`,
      descricao: b.entry.description,
      kind: b.entry.kind,
      status: b.entry.status,
      centavos: centavosDeDecimal(b.cash),
      vencimentoKey: saoPauloParts(b.entry.dueDate).dateKey,
      // Baixa já registrada: a data dela é o sinal mais forte para o extrato.
      pagoEmKey: saoPauloParts(b.paidAt).dateKey,
      contraparteNome: b.entry.counterparty.name,
      contraparteDocumento: b.entry.counterparty.document,
      conciliado: false,
      bloqueioDeBaixa: null,
    })),
  ];
}
