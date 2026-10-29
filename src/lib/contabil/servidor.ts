// O lado servidor do De-para e lançamentos (29/10/2026): lê as entradas do
// acervo, as regras, o plano e as contas-modelo da empresa base, e entrega à
// tela o relatório pronto. Tudo processado aqui, no Connect — o motor do SPED
// não participa desta parte.

import "server-only";
import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import type { LinhaDaDominio } from "@/lib/financeiro/dominio/planilha";
import {
  CTE, NFE, NFSE, MODELOS_VAZIOS, TIPOS_DA_ENTRADA, contaNoPlano, montarRelatorio,
  type ContaDoPlano, type Entrada, type Lancamento, type Modelos, type Pendencia, type Regra, type Relatorio, type TipoDaEntrada,
} from "./lancamentos";
import { criarSugestor, type Sugestao } from "./sugestao";

const TIPO_DO_ACERVO = { NFE, CTE, NFSE } as const;

/** A empresa da tela e a base dela (a matriz, ou ela mesma), onde moram regras, plano e modelos. */
export async function empresaDoContabil(tenantId: string, companyId: string) {
  const c = await getPrisma().company.findFirst({ where: { id: companyId, tenantId }, select: { id: true, cnpj: true, parentCompanyId: true } });
  if (!c) return null;
  return { id: c.id, cnpj: (c.cnpj ?? "").replace(/\D/g, ""), baseId: c.parentCompanyId ?? c.id };
}
export type EmpresaDoContabil = NonNullable<Awaited<ReturnType<typeof empresaDoContabil>>>;

/** As entradas da empresa no mês: notas do acervo em que ela é a destinatária (a tomadora, no CT-e). */
export async function entradasDoMes(tenantId: string, empresa: EmpresaDoContabil, competencia: string): Promise<Entrada[]> {
  if (!empresa.cnpj) return [];
  const docs = await getPrisma().fiscalDocument.findMany({
    where: { tenantId, companyId: empresa.id, competence: competencia, recipientDocument: empresa.cnpj, type: { in: ["NFE", "CTE", "NFSE"] }, removedAtOrigin: false },
    select: { id: true, type: true, accessKey: true, number: true, series: true, issuerName: true, issuerDocument: true, amount: true, issuedAt: true, situation: true, cfops: true },
  });
  return docs.map((d) => ({
    chave: d.accessKey ?? d.id,
    tipo: TIPO_DO_ACERVO[d.type as keyof typeof TIPO_DO_ACERVO],
    cnpj: d.issuerDocument.replace(/\D/g, ""),
    nome: d.issuerName.trim() === "—" ? "" : d.issuerName.trim(),
    numero: d.number,
    serie: d.series ?? "",
    data: saoPauloParts(d.issuedAt).dateKey,
    centavos: d.amount === null ? 0 : centavosDeDecimal(d.amount),
    cfops: (d.cfops ?? "").split(",").filter(Boolean).sort(),
    cancelada: d.situation === "CANCELADA",
  }));
}

export type ConfiguracaoDoContabil = {
  modelos: Modelos & { prefixoFornecedores: string; codigoFilial: string };
  planoCarregadoEm: Date | null;
  contasNoPlano: number;
};

async function lerBase(tenantId: string, baseId: string) {
  const prisma = getPrisma();
  const [regras, contas, modelo] = await Promise.all([
    prisma.contabilRegra.findMany({ where: { tenantId, companyId: baseId }, orderBy: [{ nomeFornecedor: "asc" }, { cfop: "asc" }] }),
    prisma.contabilConta.findMany({ where: { tenantId, companyId: baseId }, select: { reduzido: true, classificacao: true, nome: true, analitica: true }, orderBy: { classificacao: "asc" } }),
    prisma.contabilModelo.findUnique({ where: { companyId: baseId } }),
  ]);
  return { regras, contas, modelo };
}

export type LancamentoNaTela = Lancamento & { debitoNome: string; creditoNome: string };
export type PendenciaNaTela = Pendencia & { sugestao: Sugestao | null };
export type RegraNaTela = Regra & { id: string; debitoNome: string; creditoNome: string; foraDoPlano: boolean; atualizadaEm: string };

export type PainelDoContabil = Omit<Relatorio, "lancamentos" | "pendencias"> & {
  lancamentos: LancamentoNaTela[];
  pendencias: PendenciaNaTela[];
  regras: RegraNaTela[];
  configuracao: ConfiguracaoDoContabil;
  /** A conta das notas, que fecha por construção: entradas = lançadas + pendentes + fora. */
  conferencia: { entradas: number; centavos: number; porTipo: Record<TipoDaEntrada, number>; lancadas: number; pendentes: number; fora: number; semCfop: number };
};

/** Tudo o que a tela do De-para e lançamentos mostra de uma empresa e um mês. */
export async function painelDoContabil(tenantId: string, empresa: EmpresaDoContabil, competencia: string): Promise<PainelDoContabil> {
  const [entradas, base] = await Promise.all([entradasDoMes(tenantId, empresa, competencia), lerBase(tenantId, empresa.baseId)]);
  const regras: (Regra & { id: string; updatedAt: Date })[] = base.regras;
  const modelos = base.modelo ?? { ...MODELOS_VAZIOS, prefixoFornecedores: "", codigoFilial: "", planoCarregadoEm: null };
  const prefixo = modelos.prefixoFornecedores.trim();
  // As analíticas de fornecedor dão o crédito do CT-e e da NFS-e sem regra e a
  // sugestão das pendências. Sem o prefixo, nenhuma das duas: casar nome contra
  // o plano inteiro acharia conta de despesa com nome de gente.
  const fornecedores: ContaDoPlano[] = prefixo ? base.contas.filter((c) => c.analitica && c.classificacao.startsWith(prefixo)) : [];
  const relatorio = montarRelatorio(entradas, regras, modelos, fornecedores.length ? contaNoPlano(fornecedores) : undefined);
  const nomes = new Map(base.contas.map((c) => [c.reduzido, `${c.classificacao} — ${c.nome}`]));
  const nomeDa = (conta: string) => nomes.get(conta) ?? "";
  const sugerir = criarSugestor(fornecedores);
  const comPlano = base.contas.length > 0;
  const porTipo = Object.fromEntries(TIPOS_DA_ENTRADA.map((t) => [t, entradas.filter((e) => e.tipo === t).length])) as Record<TipoDaEntrada, number>;
  return {
    ...relatorio,
    lancamentos: relatorio.lancamentos.map((l) => ({ ...l, debitoNome: nomeDa(l.debito), creditoNome: nomeDa(l.credito) })),
    pendencias: relatorio.pendencias.map((p) => ({ ...p, sugestao: sugerir(p.nomeFornecedor) })),
    regras: regras.map((r) => ({
      id: r.id, cnpjFornecedor: r.cnpjFornecedor, cfop: r.cfop, nomeFornecedor: r.nomeFornecedor, contaDebito: r.contaDebito, contaCredito: r.contaCredito,
      codigoHistorico: r.codigoHistorico, historico: r.historico, desconsiderar: r.desconsiderar,
      debitoNome: nomeDa(r.contaDebito), creditoNome: nomeDa(r.contaCredito),
      // A conta fora do plano vira marca na regra, não recusa no cadastro: some sozinha quando o plano é recarregado.
      foraDoPlano: comPlano && [r.contaDebito, r.contaCredito].some((c) => c && !nomes.has(c)),
      atualizadaEm: r.updatedAt.toISOString(),
    })),
    configuracao: {
      modelos: {
        debitoCte: modelos.debitoCte, debitoNfse: modelos.debitoNfse, contaImobilizado: modelos.contaImobilizado,
        historicoImobilizado: modelos.historicoImobilizado, prefixoFornecedores: modelos.prefixoFornecedores, codigoFilial: modelos.codigoFilial,
      },
      planoCarregadoEm: modelos.planoCarregadoEm,
      contasNoPlano: base.contas.length,
    },
    conferencia: {
      entradas: entradas.length,
      centavos: entradas.reduce((s, e) => s + e.centavos, 0),
      porTipo,
      lancadas: relatorio.lancamentos.length,
      pendentes: relatorio.pendencias.reduce((s, p) => s + p.qtd, 0),
      fora: relatorio.descartados.reduce((s, d) => s + d.qtd, 0),
      semCfop: entradas.filter((e) => e.tipo !== NFSE && !e.cfops.length).length,
    },
  };
}

/** As linhas da planilha de importação de um tipo de documento: um arquivo por tipo, para não duplicar na Domínio as NF-e já importadas. */
export function linhasParaADominio(lancamentos: readonly Lancamento[], tipo: TipoDaEntrada, codigoFilial: string): LinhaDaDominio[] {
  return lancamentos.filter((l) => l.tipo === tipo).map((l) => ({
    dataKey: l.data, debito: l.debito, credito: l.credito, centavos: l.centavos,
    codigoHistorico: l.codigoHistorico, complemento: l.historico, codigoFilial,
  }));
}
