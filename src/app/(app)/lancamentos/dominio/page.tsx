import { notFound } from "next/navigation";
import { ArrowLeft, FileSpreadsheet, Landmark } from "lucide-react";
import { BaixarParaADominio } from "@/components/financeiro/dominio/BaixarParaADominio";
import { getAuthContext, canViewSector, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { getPrisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { EmpresaDaTela } from "@/components/empresas/EmpresaDaTela";
import { FiltroDePeriodo } from "@/components/financeiro/FiltroDePeriodo";
import { DeParaDaDominio, type GrupoDoDePara } from "@/components/financeiro/dominio/DeParaDaDominio";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { competenciaDoInstante, competenciaValida } from "@/lib/financeiro/periodo";
import { moeda } from "@/lib/financeiro/formato";
import { formatarCompetencia, formatInstantDateTime } from "@/lib/format";
import { nomeDaContaBancaria } from "@/lib/financeiro/contaPrevista";
import { correcaoDoMes, exportacaoDoMes, exportacoesDoMes } from "@/lib/financeiro/dominio/servidor";
import { dataCurta } from "@/components/financeiro/conciliacao/data";

export const dynamic = "force-dynamic";

const MODULE = "bpo_lancamentos";
const SECTOR = getModuleDef(MODULE)!.sectorCode;

/** Quantas linhas a tela mostra da planilha — o arquivo leva todas. */
const LIMITE_DA_PREVIA = 200;

/**
 * A planilha de importação da Domínio com as baixas do mês de uma empresa
 * (fila do BPO, 21/10): o que vai no arquivo, o que fica de fora e por quê, e
 * o de-para dos cadastros para as contas contábeis.
 */
export default async function ExportacaoDominioPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getAuthContext();
  const setor = ctx.tenantId ? ((await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR) : SECTOR;
  if (!ctx.tenantId || !canViewSector(ctx, setor)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  const podeEditar = canActOnSector(ctx, setor);
  const tenantId = ctx.tenantId;

  const params = await searchParams;
  const mes = competenciaValida(params.mes) ?? competenciaDoInstante(new Date());
  const empresas = await empresasDoSeletor(tenantId);
  // Com uma empresa em foco, só ela, a matriz e as filiais — como Lançamentos.
  const { escolha, empresa, noSeletor, foco } = await escolherEmpresaDaTela(ctx, params.empresa, empresas, { comFoco: true });
  const companyId = empresa?.id ?? null;

  const cabecalho = (
    <PageHeader
      title="Exportar para a Domínio"
      subtitle="As baixas do mês — o que foi pago e recebido, contra o banco — na planilha que o Contábil importa na Domínio."
      action={
        <Button href={`/lancamentos${companyId ? `?empresa=${companyId}&mes=${mes}` : ""}`} variant="ghost" size="sm">
          <ArrowLeft size={14} /> Lançamentos
        </Button>
      }
    />
  );
  const filtro = (
    <FiltroDaEmpresa acao="/lancamentos/dominio" empresas={noSeletor} foco={foco} valor={companyId} manter={{ mes }}>
      {companyId && <FiltroDePeriodo acao="/lancamentos/dominio" mes={mes} extras={{ empresa: companyId }} naFileira />}
    </FiltroDaEmpresa>
  );

  if (!empresa || !companyId) {
    return (
      <PageContainer>
        {cabecalho}
        {empresas.length === 0 ? (
          <EmptyState title="Nenhuma empresa ativa" icon={<Landmark />} />
        ) : (
          <>
            {filtro}
            <EscolhaAEmpresa escolha={escolha} porQue="A planilha da Domínio é de uma empresa por vez." />
          </>
        )}
      </PageContainer>
    );
  }

  const r = await exportacaoDoMes(tenantId, companyId, mes);
  if (!r) notFound();
  const prisma = getPrisma();

  // O de-para que a tela oferece: o que as baixas do mês usam, e o que já tem conta.
  const usadas = new Set<string>();
  for (const b of r.baixas) {
    if (b.conta.categoryId) usadas.add(b.conta.categoryId);
    for (const p of b.conta.rateio) if (p.categoryId) usadas.add(p.categoryId);
    if (b.jurosCentavos + b.multaCentavos > 0 && b.interestCategoryId) usadas.add(b.interestCategoryId);
    if (b.descontoCentavos > 0 && b.discountCategoryId) usadas.add(b.discountCategoryId);
  }
  const contrapartesDoMes = new Set(r.baixas.map((b) => b.conta.counterpartyId));
  const [categorias, contas, contrapartes] = await Promise.all([
    prisma.financeCategory.findMany({
      where: { tenantId, id: { in: [...new Set([...usadas, ...r.dePara.CATEGORIA.keys()])] } },
      select: { id: true, name: true, kind: true },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
    prisma.bankAccount.findMany({
      where: { tenantId, companyId },
      select: { id: true, nickname: true, accountNumber: true, type: true, active: true },
      orderBy: { nickname: "asc" },
    }),
    prisma.financeCounterparty.findMany({
      where: { tenantId, companyId, id: { in: [...new Set([...contrapartesDoMes, ...r.dePara.CONTRAPARTE.keys()])] } },
      select: { id: true, name: true, document: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const bancosDoMes = new Set(r.baixas.flatMap((b) => (b.bankAccountId ? [b.bankAccountId] : [])));
  const grupos: GrupoDoDePara[] = [
    {
      prefixo: "banco:",
      titulo: "Contas bancárias",
      ajuda: "A conta do banco (ou da caixinha, do cartão) no plano da Domínio. É o outro lado de toda baixa.",
      itens: contas
        .filter((c) => c.active || bancosDoMes.has(c.id) || r.dePara.CONTA_BANCARIA.has(c.id))
        .map((c) => ({
          id: c.id,
          nome: nomeDaContaBancaria(c),
          conta: r.dePara.CONTA_BANCARIA.get(c.id) ?? "",
          faltaNoMes: bancosDoMes.has(c.id) && !r.dePara.CONTA_BANCARIA.has(c.id),
        })),
    },
    {
      prefixo: "cat:",
      titulo: "Categorias",
      ajuda: "A despesa ou a receita da baixa — e as de juros, multa e desconto. São as categorias que as baixas do mês usam.",
      itens: categorias.map((c) => ({
        id: c.id,
        nome: c.name,
        detalhe: c.kind === "PAGAR" ? "Despesa (conta a pagar)" : "Receita (conta a receber)",
        conta: r.dePara.CATEGORIA.get(c.id) ?? "",
        faltaNoMes: usadas.has(c.id) && !r.dePara.CATEGORIA.has(c.id),
      })),
    },
    {
      prefixo: "cp:",
      titulo: "Fornecedores e clientes (opcional)",
      ajuda:
        "Com conta aqui, a baixa liquida a conta do fornecedor (ou do cliente) em vez de ir direto para a despesa — o caso da nota que o SPED Generator já provisionou. Em branco, vale a conta da categoria.",
      itens: contrapartes.map((c) => ({ id: c.id, nome: c.name, detalhe: c.document, conta: r.dePara.CONTRAPARTE.get(c.id) ?? "", faltaNoMes: false })),
    },
  ];

  const total = r.linhas.reduce((s, l) => s + l.centavos, 0);
  const baixasProntas = r.baixas.length - r.pendencias.length;
  const download = (formato: "xlsx" | "txt", tipo?: "correcao") =>
    `/lancamentos/dominio/exportar?empresa=${companyId}&mes=${mes}&formato=${formato}${tipo ? `&tipo=${tipo}` : ""}`;
  // A correção (lote 3, 28/10/2026): contra a última planilha baixada deste mês.
  const [feitas, correcao] = await Promise.all([exportacoesDoMes(tenantId, companyId, mes), correcaoDoMes(tenantId, companyId, mes, r)]);
  const ultima = feitas[0] ?? null;

  return (
    <EmpresaDaTela empresa={{ nome: empresa.nome, cnpj: empresa.cnpj }}>
      <PageContainer>
        {cabecalho}
        {filtro}

        <Card className="p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-ui text-fg-secondary">
            <p>
              <strong className="text-fg">{formatarCompetencia(mes)}</strong>: {r.baixas.length} {r.baixas.length === 1 ? "baixa" : "baixas"} ·{" "}
              {baixasProntas} {baixasProntas === 1 ? "pronta" : "prontas"} em {r.linhas.length} {r.linhas.length === 1 ? "linha" : "linhas"} ({moeda(total)})
              {r.pendencias.length > 0 && (
                <span className="text-warning-fg">
                  {" "}
                  · {r.pendencias.length} fora do arquivo
                </span>
              )}
            </p>
            {!r.codigoFilial && <p className="text-micro text-warning-fg">Sem o código Matriz/Filial da Domínio — preencha no de-para, abaixo.</p>}
          </div>
          {podeEditar && !ultima && r.linhas.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <BaixarParaADominio href={download("xlsx")} formato="xlsx" rotulo="Domínio (.xlsx)" variant="primary" />
              <BaixarParaADominio href={download("txt")} formato="txt" rotulo="Domínio (.txt)" />
            </div>
          )}
        </Card>

        {ultima && correcao && (
          <Card className="p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-ui text-fg-secondary">
              <p>
                Última planilha deste mês: <strong className="text-fg">{ultima.tipo === "CORRECAO" ? "correção" : "mês inteiro"}</strong>, em{" "}
                {formatInstantDateTime(ultima.em, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                {ultima.por ? ` por ${ultima.por}` : ""}.
              </p>
              <p>
                {correcao.linhas.length === 0 ? (
                  "Nada mudou desde ela: a Domínio já tem o que está aqui."
                ) : (
                  <>
                    Desde ela: {correcao.novas} {correcao.novas === 1 ? "baixa nova" : "baixas novas"}, {correcao.alteradas}{" "}
                    {correcao.alteradas === 1 ? "alterada" : "alteradas"} e {correcao.removidas} {correcao.removidas === 1 ? "que saiu" : "que saíram"} —{" "}
                    <strong className="text-fg">
                      {correcao.linhas.length} {correcao.linhas.length === 1 ? "linha" : "linhas"} na correção
                    </strong>
                    , com o estorno do que mudou ou saiu.
                  </>
                )}
              </p>
              <p className="text-micro text-fg-muted">Importar o mês inteiro de novo duplica na Domínio o que já foi importado. Para acertar, use a correção.</p>
            </div>
            {podeEditar && (
              <div className="flex flex-wrap items-center gap-2">
                {correcao.linhas.length > 0 && (
                  <>
                    <BaixarParaADominio href={download("xlsx", "correcao")} formato="xlsx" rotulo="Correção (.xlsx)" variant="primary" />
                    <BaixarParaADominio href={download("txt", "correcao")} formato="txt" rotulo="Correção (.txt)" />
                  </>
                )}
                {r.linhas.length > 0 && (
                  <BaixarParaADominio
                    href={download("xlsx")}
                    formato="xlsx"
                    rotulo="Mês inteiro de novo"
                    confirmar={{
                      titulo: "Baixar o mês inteiro de novo?",
                      descricao:
                        "Importar esta planilha duplica na Domínio tudo o que já foi importado deste mês. Para acertar o que mudou, use a correção.",
                      botao: "Baixar o mês inteiro",
                    }}
                  />
                )}
              </div>
            )}
          </Card>
        )}

        {r.pendencias.length > 0 && (
          <Aviso tom="atencao" className="mb-4">
            <span className="flex flex-col gap-1">
              <span className="font-medium">Fora do arquivo — dê a conta no de-para, abaixo, e recarregue:</span>
              {r.pendencias.slice(0, 50).map((p) => (
                <span key={p.baixaId} className="text-fs-2">
                  {dataCurta(p.dataKey)} · {p.contraparteNome} · {moeda(p.centavos)} — {p.motivo}
                </span>
              ))}
              {r.pendencias.length > 50 && <span className="text-fs-2">e mais {r.pendencias.length - 50}.</span>}
            </span>
          </Aviso>
        )}

        <h2 className="text-section font-semibold text-fg mb-3">O que vai na planilha</h2>
        <CascoDaTabela contagem={contarItens(r.linhas.length, "linha", "linhas", r.linhas.length > LIMITE_DA_PREVIA)}>
          {r.linhas.length === 0 ? (
            <EmptyState
              title="Nenhuma linha pronta"
              description={r.baixas.length === 0 ? "Nenhuma baixa nesta empresa neste mês." : "Todas as baixas do mês estão fora do arquivo — veja por quê acima."}
              icon={<FileSpreadsheet />}
            />
          ) : (
            <div className="c41-tabela overflow-x-auto bg-surface border border-border rounded-lg">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border">
                    <th className="py-2 pr-3 font-medium">Data</th>
                    <th className="py-2 pr-3 font-medium">Débito</th>
                    <th className="py-2 pr-3 font-medium">Crédito</th>
                    <th className="py-2 pr-3 font-medium text-right">Valor</th>
                    <th className="py-2 font-medium">Complemento do histórico</th>
                  </tr>
                </thead>
                <tbody>
                  {r.linhas.slice(0, LIMITE_DA_PREVIA).map((l, i) => (
                    <tr key={i} className="border-b border-border-soft">
                      <td className="py-2 pr-3 tabular-nums whitespace-nowrap">{dataCurta(l.dataKey)}</td>
                      <td className="py-2 pr-3 tabular-nums">{l.debito}</td>
                      <td className="py-2 pr-3 tabular-nums">{l.credito}</td>
                      <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{moeda(l.centavos)}</td>
                      <td className="py-2 text-fs-2 text-fg-secondary">{l.complemento}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CascoDaTabela>

        {feitas.length > 0 && (
          <>
            <h2 className="text-section font-semibold text-fg mt-8 mb-3">Planilhas baixadas deste mês</h2>
            <div className="c41-tabela overflow-x-auto bg-surface border border-border rounded-lg">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border">
                    <th className="py-2 pr-3 font-medium">Quando</th>
                    <th className="py-2 pr-3 font-medium">O quê</th>
                    <th className="py-2 pr-3 font-medium">Linhas</th>
                    <th className="py-2 font-medium">Quem</th>
                  </tr>
                </thead>
                <tbody>
                  {feitas.map((f) => (
                    <tr key={f.id} className="border-b border-border-soft">
                      <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                        {formatInstantDateTime(f.em, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-2 pr-3">
                        {f.tipo === "CORRECAO" ? "Correção" : "Mês inteiro"} (.{f.formato})
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{f.linhas}</td>
                      <td className="py-2">{f.por ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h2 className="text-section font-semibold text-fg mt-8 mb-3">De-para da empresa</h2>
        <DeParaDaDominio companyId={companyId} codigoFilial={r.codigoFilial} grupos={grupos} podeEditar={podeEditar} />

        <NotaDeFonte>
          O layout é o mesmo da planilha de notas do SPED Generator (aba Planilha1, as dez colunas da Domínio): importe pela importação
          de lançamentos da Domínio, uma vez por mês e empresa. Entram só as baixas — a provisão das notas de compra continua vindo do
          SPED Generator. Pagamento: débito na conta do fornecedor (se tiver no de-para) ou da categoria, crédito no banco; recebimento,
          o contrário. Juros e multa vão na categoria de encargos da baixa, e o desconto na de desconto. A baixa com alguma conta
          faltando fica inteira fora do arquivo. O código do histórico vai vazio, e o complemento diz a baixa. Toda planilha baixada
          fica registrada: depois da primeira, a correção leva só o que mudou — as baixas novas e o estorno (débito e crédito
          trocados, na mesma data) das que saíram ou mudaram. Planilhas baixadas antes de 28/10/2026 não ficaram registradas.
        </NotaDeFonte>
      </PageContainer>
    </EmpresaDaTela>
  );
}
