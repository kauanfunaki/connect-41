// O lado servidor dos Pagamentos sem nota (03/11/2026): lê da empresa base os
// pagamentos lidos dos documentos, as regras e as contas, e entrega à tela o
// relatório de `pagamentos.ts`. Como no motor, tudo é da matriz: o pagamento
// não diz de qual estabelecimento é, e lançar em dois dobraria o valor.

import "server-only";
import { getPrisma } from "@/lib/prisma";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import type { LinhaDaDominio } from "@/lib/financeiro/dominio/planilha";
import type { ContaDoPlano } from "./lancamentos";
import { linhasDosPagamentos } from "./exportacaoDosPagamentos";
import {
  CONTAS_DO_MOTOR, PlanoDeFornecedores, entraNoLancamento, montarPagamentos,
  type ContasDosPagamentos, type LancamentoDoPagamento, type Pagamento, type PendenciaDoPagamento, type RegraDaCategoria, type RelatorioDosPagamentos, type Retencao,
} from "./pagamentos";
import type { EmpresaDoContabil } from "./servidor";

/** As contas dos lançamentos-modelo da empresa: as gravadas por cima das do motor. */
export async function contasDosPagamentos(tenantId: string, baseId: string): Promise<ContasDosPagamentos> {
  const linhas = await getPrisma().contabilContaPagamento.findMany({ where: { tenantId, companyId: baseId }, select: { chave: true, conta: true } });
  const contas = { ...CONTAS_DO_MOTOR };
  for (const l of linhas) if (l.chave in contas) contas[l.chave as keyof ContasDosPagamentos] = l.conta;
  return contas;
}

const centavos = (v: { toString(): string } | null) => (v === null ? null : centavosDeDecimal(v));

function retencoesDoBanco(v: unknown): Retencao[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((r): r is Record<string, unknown> => !!r && typeof r === "object").map((r) => ({ verba: String(r.verba ?? ""), descricao: String(r.descricao ?? ""), centavos: Number(r.centavos ?? 0) }));
}

type LinhaDoBanco = Awaited<ReturnType<typeof lerLinhasDoMes>>[number];

/** O pagamento como a regra o vê: o que a conferência corrigiu vence o que a leitura achou. */
export function pagamentoEfetivo(l: LinhaDoBanco): Pagamento {
  return {
    id: l.id, tipo: l.tipo, tipoCorrigido: l.tipoCorrigido, categoria: l.categoria || l.arquivo.categoria, categoriaCorrigida: l.categoriaCorrigida,
    nome: l.nomeCorrigido.trim() || l.nome.trim(), documento: (l.documentoCorrigido || l.documento).replace(/\D/g, ""), numero: l.numero,
    dataPagamento: l.dataPagamentoCorrigida.trim() || l.dataPagamento.trim(), competencia: l.competenciaCorrigida.trim() || l.competencia.trim(),
    // R$ 0,00 é correção legítima (recibo rasurado): só o nulo é "sem correção".
    brutoCentavos: l.valorCorrigido !== null ? centavos(l.valorCorrigido) : centavos(l.bruto),
    liquidoCentavos: l.valorCorrigido !== null ? centavos(l.valorCorrigido) : centavos(l.liquido),
    retencoes: retencoesDoBanco(l.retencoes), arquivo: l.arquivo.nome, pasta: l.arquivo.pasta, pagina: l.pagina,
    arquivoId: l.comprovanteId ?? (l.tipo === "fatura" ? null : l.arquivoId),
  };
}

/** As linhas do mês, pela competência que vale (a corrigida, senão a lida). */
async function lerLinhasDoMes(tenantId: string, baseId: string, competencia: string) {
  return getPrisma().contabilPagamento.findMany({
    where: { tenantId, companyId: baseId, OR: [{ competenciaCorrigida: competencia }, { competenciaCorrigida: "", competencia }] },
    include: { arquivo: { select: { nome: true, pasta: true, categoria: true, tipo: true } } },
    orderBy: [{ competencia: "asc" }, { dataPagamento: "asc" }, { nome: "asc" }],
  });
}

/** Os pagamentos que viram lançamento no mês: só os que contam (ver `entraNoLancamento`). */
export async function pagamentosDoMes(tenantId: string, baseId: string, competencia: string): Promise<Pagamento[]> {
  return (await lerLinhasDoMes(tenantId, baseId, competencia)).filter(entraNoLancamento).map(pagamentoEfetivo);
}

async function lerBaseDosPagamentos(tenantId: string, baseId: string) {
  const prisma = getPrisma();
  const [regras, contas, modelo, categorias, nomes, contasDoModelo] = await Promise.all([
    prisma.contabilRegra.findMany({ where: { tenantId, companyId: baseId, desconsiderar: false }, select: { cnpjFornecedor: true, cfop: true, contaCredito: true }, orderBy: [{ cnpjFornecedor: "asc" }, { cfop: "asc" }] }),
    prisma.contabilConta.findMany({ where: { tenantId, companyId: baseId }, select: { reduzido: true, classificacao: true, nome: true, analitica: true } }),
    prisma.contabilModelo.findUnique({ where: { companyId: baseId }, select: { prefixoFornecedores: true, codigoFilial: true } }),
    prisma.contabilPagamentoCategoria.findMany({ where: { tenantId, companyId: baseId } }),
    prisma.contabilPagamentoNome.findMany({ where: { tenantId, companyId: baseId }, orderBy: { nome: "asc" } }),
    contasDosPagamentos(tenantId, baseId),
  ]);
  // O crédito sai do mesmo de-para das notas: a conta da pessoa a quem se paga.
  // A regra padrão do fornecedor (CFOP vazio) vem primeiro, pela ordem.
  const contasDoFornecedor = new Map<string, string>();
  for (const r of regras) if (r.cnpjFornecedor && r.contaCredito && !contasDoFornecedor.has(r.cnpjFornecedor)) contasDoFornecedor.set(r.cnpjFornecedor, r.contaCredito);
  const prefixo = (modelo?.prefixoFornecedores ?? "").trim();
  const fornecedores: ContaDoPlano[] = prefixo ? contas.filter((c) => c.analitica && c.classificacao.startsWith(prefixo)) : [];
  return {
    contas, codigoFilial: modelo?.codigoFilial ?? "", prefixo, contasDoModelo, nomes,
    categorias: Object.fromEntries(categorias.map((c) => [c.categoria, { codigoDebito: c.codigoDebito, contaCredito: c.contaCredito }])) as Record<string, RegraDaCategoria>,
    categoriasGravadas: categorias,
    entradas: {
      contasDoFornecedor,
      contasPorNome: new Map(nomes.filter((n) => n.contaCredito).map((n) => [n.chaveNome, n.contaCredito])),
      plano: new PlanoDeFornecedores(fornecedores),
    },
  };
}

/** O relatório do mês, pronto para a planilha (o lote anual chama este). */
export async function relatorioDosPagamentos(tenantId: string, empresa: EmpresaDoContabil, competencia: string): Promise<RelatorioDosPagamentos & { codigoFilial: string }> {
  const [pagamentos, base] = await Promise.all([pagamentosDoMes(tenantId, empresa.baseId, competencia), lerBaseDosPagamentos(tenantId, empresa.baseId)]);
  return { ...montarPagamentos(pagamentos, { ...base.entradas, categorias: base.categorias, contas: base.contasDoModelo }), codigoFilial: base.codigoFilial };
}

/**
 * As linhas da planilha de importação da Domínio dos pagamentos sem nota de
 * um mês, sempre na matriz (07/10/2026: o lançamento-modelo do contábil é todo
 * na matriz), e quantos documentos ficaram pendentes. É o que o lote do ano
 * chama. Lança quando há lançamento e falta o código da filial — sem ele a
 * planilha não diz onde lançar.
 */
export async function linhasDosPagamentosDoMes(tenantId: string, empresa: EmpresaDoContabil, competencia: string): Promise<{ linhas: LinhaDaDominio[]; pendencias: number }> {
  const r = await relatorioDosPagamentos(tenantId, empresa, competencia);
  if (r.lancamentos.length && !r.codigoFilial.trim()) throw new Error("A matriz não tem o Código Matriz/Filial da Domínio em Plano e contas: sem ele a planilha não diz onde lançar.");
  return { linhas: linhasDosPagamentos(r.lancamentos, r.codigoFilial), pendencias: r.documentosPendentes };
}


// ---- a tela ------------------------------------------------------------------

export type DocumentoLido = {
  id: string; arquivoId: string; arquivo: string; pagina: number; ordem: number; tipo: string;
  situacao: string; observacao: string; decisao: string; motivoDecisao: string;
  nome: string; documento: string; numero: string; dataPagamento: string; competencia: string; centavos: number | null;
  categoria: string; corrigido: boolean; mesmoDocumentoEm: number;
};
export type ArquivoEnviado = { id: string; tipo: string; categoria: string; nome: string; pasta: string; paginas: number; semTexto: number; linhas: number; enviadoEm: string };

export type PainelDosPagamentos = Omit<RelatorioDosPagamentos, "lancamentos" | "pendencias"> & {
  lancamentos: (LancamentoDoPagamento & { debitoNome: string; creditoNome: string })[];
  pendencias: PendenciaDoPagamento[];
  /** O que precisa de gente: leitura que não fechou, sem texto, ou descartada. */
  conferir: DocumentoLido[];
  /** Quantos documentos do mês estão em cada situação efetiva. */
  situacoes: Record<string, number>;
  arquivos: ArquivoEnviado[];
  categorias: { categoria: string; codigoDebito: string; contaCredito: string; observacao: string }[];
  nomes: { id: string; chaveNome: string; nome: string; contaCredito: string; contaNome: string }[];
  contas: ContasDosPagamentos;
  contasGravadas: (keyof ContasDosPagamentos)[];
  codigoFilial: string;
  prefixoFornecedores: string;
  planoCarregado: boolean;
  /** O plano inteiro, para o campo de conta e o editor de regra. */
  contasDoPlano: ContaDoPlano[];
};

/** Tudo o que a etapa Pagamentos sem nota mostra de uma empresa e um mês. */
export async function painelDosPagamentos(tenantId: string, empresa: EmpresaDoContabil, competencia: string): Promise<PainelDosPagamentos> {
  const prisma = getPrisma();
  const [linhas, base, arquivos, gravadas] = await Promise.all([
    lerLinhasDoMes(tenantId, empresa.baseId, competencia),
    lerBaseDosPagamentos(tenantId, empresa.baseId),
    prisma.contabilDocumentoPagamento.findMany({
      where: { tenantId, companyId: empresa.baseId }, orderBy: { createdAt: "desc" }, take: 200,
      select: { id: true, tipo: true, categoria: true, nome: true, pasta: true, paginas: true, semTexto: true, createdAt: true, _count: { select: { pagamentos: true } } },
    }),
    prisma.contabilContaPagamento.findMany({ where: { tenantId, companyId: empresa.baseId }, select: { chave: true } }),
  ]);
  const relatorio = montarPagamentos(linhas.filter(entraNoLancamento).map(pagamentoEfetivo), { ...base.entradas, categorias: base.categorias, contas: base.contasDoModelo });
  const nomes = new Map(base.contas.map((c) => [c.reduzido, `${c.classificacao} — ${c.nome}`]));
  const nomeDa = (conta: string) => nomes.get(conta) ?? "";
  const porChave = new Map<string, number>();
  for (const l of linhas) if (l.chaveNegocio) porChave.set(l.chaveNegocio, (porChave.get(l.chaveNegocio) ?? 0) + 1);
  const situacoes: Record<string, number> = {};
  const conferir: DocumentoLido[] = [];
  for (const l of linhas) {
    const efetivo = pagamentoEfetivo(l);
    const situacao = l.decisao === "aceito" ? "ok" : l.decisao === "descartado" ? "descartado" : l.situacao;
    situacoes[situacao] = (situacoes[situacao] ?? 0) + 1;
    const repetido = (porChave.get(l.chaveNegocio) ?? 0) - 1;
    if (situacao === "ok" && !repetido && !l.decisao) continue;
    conferir.push({
      id: l.id, arquivoId: l.arquivoId, arquivo: l.arquivo.nome, pagina: l.pagina, ordem: l.ordem, tipo: l.tipoCorrigido || l.tipo,
      situacao: l.situacao, observacao: l.observacao, decisao: l.decisao, motivoDecisao: l.motivoDecisao,
      nome: efetivo.nome, documento: efetivo.documento, numero: l.numero, dataPagamento: efetivo.dataPagamento, competencia: efetivo.competencia,
      centavos: efetivo.brutoCentavos, categoria: l.categoriaCorrigida || l.categoria,
      corrigido: !!(l.nomeCorrigido || l.documentoCorrigido || l.competenciaCorrigida || l.dataPagamentoCorrigida || l.tipoCorrigido || l.categoriaCorrigida || l.valorCorrigido !== null),
      mesmoDocumentoEm: Math.max(0, repetido),
    });
  }
  return {
    ...relatorio,
    lancamentos: relatorio.lancamentos.map((l) => ({ ...l, debitoNome: nomeDa(l.debito), creditoNome: nomeDa(l.credito) })),
    conferir, situacoes,
    arquivos: arquivos.map((a) => ({ id: a.id, tipo: a.tipo, categoria: a.categoria, nome: a.nome, pasta: a.pasta, paginas: a.paginas, semTexto: a.semTexto, linhas: a._count.pagamentos, enviadoEm: a.createdAt.toISOString() })),
    categorias: base.categoriasGravadas.map(({ categoria, codigoDebito, contaCredito, observacao }) => ({ categoria, codigoDebito, contaCredito, observacao })),
    nomes: base.nomes.map((n) => ({ id: n.id, chaveNome: n.chaveNome, nome: n.nome, contaCredito: n.contaCredito, contaNome: nomeDa(n.contaCredito) })),
    contas: base.contasDoModelo,
    contasGravadas: gravadas.map((g) => g.chave as keyof ContasDosPagamentos),
    codigoFilial: base.codigoFilial,
    prefixoFornecedores: base.prefixo,
    planoCarregado: base.contas.length > 0,
    contasDoPlano: base.contas.filter((c) => c.analitica).map(({ reduzido, classificacao, nome }) => ({ reduzido, classificacao, nome })),
  };
}
