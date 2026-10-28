// A leitura da exportação para a Domínio (fila do BPO, 21/10): as baixas do
// mês da empresa, o de-para e o código da filial. A montagem é pura e mora em
// `lancamentos.ts`; o arquivo, em `planilha.ts`.

import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { centavosDeDecimal } from "../contas";
import { somarMeses } from "../periodo";
import { nomeExibicao } from "@/lib/companyName";
import { lancamentosDasBaixas, type BaixaParaExportar, type DeParaDaEmpresa, type Exportacao, type TipoDoDePara } from "./lancamentos";
import { correcaoEntre, estadoDasLinhas, lerEstado, type Correcao, type EstadoExportado } from "./correcao";
import type { LinhaDaDominio } from "./planilha";
import type { Prisma } from "@/generated/prisma/client";

/** O começo do mês em São Paulo e o do mês seguinte — a baixa é gravada ao meio-dia. */
function limitesDoMes(competencia: string): { de: Date; ate: Date } {
  return { de: new Date(`${competencia}-01T00:00:00-03:00`), ate: new Date(`${somarMeses(competencia, 1)}-01T00:00:00-03:00`) };
}

/** As baixas da empresa no mês, na forma que a montagem usa. */
export async function baixasDoMes(tenantId: string, companyId: string, competencia: string): Promise<BaixaParaExportar[]> {
  const { de, ate } = limitesDoMes(competencia);
  const baixas = await getPrisma().financeEntryPayment.findMany({
    where: { tenantId, companyId, paidAt: { gte: de, lt: ate }, entry: { status: { not: "CANCELADO" } } },
    select: {
      id: true,
      paidAt: true,
      principal: true,
      interest: true,
      fine: true,
      discount: true,
      bankAccountId: true,
      bankAccount: { select: { nickname: true } },
      interestCategoryId: true,
      interestCategory: { select: { name: true } },
      discountCategoryId: true,
      discountCategory: { select: { name: true } },
      entry: {
        select: {
          kind: true,
          counterpartyId: true,
          counterparty: { select: { name: true } },
          categoryId: true,
          category: { select: { name: true } },
          description: true,
          documentNumber: true,
          allocations: {
            select: { categoryId: true, category: { select: { name: true } }, amount: true },
            orderBy: { position: "asc" },
          },
        },
      },
    },
    orderBy: [{ paidAt: "asc" }, { id: "asc" }],
  });
  return baixas.map((b) => ({
    id: b.id,
    dataKey: saoPauloParts(b.paidAt).dateKey,
    kind: b.entry.kind,
    principalCentavos: centavosDeDecimal(b.principal),
    jurosCentavos: centavosDeDecimal(b.interest),
    multaCentavos: centavosDeDecimal(b.fine),
    descontoCentavos: centavosDeDecimal(b.discount),
    bankAccountId: b.bankAccountId,
    bankAccountNome: b.bankAccount?.nickname ?? null,
    interestCategoryId: b.interestCategoryId,
    interestCategoryNome: b.interestCategory?.name ?? null,
    discountCategoryId: b.discountCategoryId,
    discountCategoryNome: b.discountCategory?.name ?? null,
    conta: {
      counterpartyId: b.entry.counterpartyId,
      contraparteNome: b.entry.counterparty.name,
      categoryId: b.entry.categoryId,
      categoriaNome: b.entry.category?.name ?? null,
      descricao: b.entry.description,
      documento: b.entry.documentNumber,
      rateio: b.entry.allocations.map((a) => ({ categoryId: a.categoryId, categoriaNome: a.category?.name ?? null, centavos: centavosDeDecimal(a.amount) })),
    },
  }));
}

/** O de-para da empresa, por tipo. */
export async function deParaDaEmpresa(tenantId: string, companyId: string): Promise<DeParaDaEmpresa> {
  const linhas = await getPrisma().dominioAccountMap.findMany({ where: { tenantId, companyId }, select: { kind: true, refId: true, account: true } });
  const porTipo = (k: TipoDoDePara) => new Map(linhas.filter((l) => l.kind === k).map((l) => [l.refId, l.account]));
  return { CATEGORIA: porTipo("CATEGORIA"), CONTA_BANCARIA: porTipo("CONTA_BANCARIA"), CONTRAPARTE: porTipo("CONTRAPARTE") };
}

export type ExportacaoDoMes = Exportacao & {
  baixas: BaixaParaExportar[];
  dePara: DeParaDaEmpresa;
  codigoFilial: string;
  empresa: { nome: string; cnpj: string | null };
};

/** Tudo o que a tela e o download precisam de uma empresa num mês. Nula se a empresa não é do tenant. */
export async function exportacaoDoMes(tenantId: string, companyId: string, competencia: string): Promise<ExportacaoDoMes | null> {
  const empresa = await getPrisma().company.findFirst({
    where: { id: companyId, tenantId },
    select: { name: true, displayName: true, cnpj: true, dominioBranchCode: true },
  });
  if (!empresa) return null;
  const [baixas, dePara] = await Promise.all([baixasDoMes(tenantId, companyId, competencia), deParaDaEmpresa(tenantId, companyId)]);
  const codigoFilial = empresa.dominioBranchCode ?? "";
  return {
    ...lancamentosDasBaixas(baixas, dePara, codigoFilial),
    baixas,
    dePara,
    codigoFilial,
    empresa: { nome: nomeExibicao(empresa), cnpj: empresa.cnpj },
  };
}

// ─── O histórico e a correção (lote 3, 28/10/2026) ──────────────────────────

export type TipoDaExportacao = "COMPLETA" | "CORRECAO";

export type ExportacaoFeita = {
  id: string;
  tipo: TipoDaExportacao;
  formato: string;
  linhas: number;
  em: Date;
  por: string | null;
};

/** As planilhas já baixadas da empresa no mês, a mais nova primeiro. */
export async function exportacoesDoMes(tenantId: string, companyId: string, competencia: string, limite = 10): Promise<ExportacaoFeita[]> {
  const prisma = getPrisma();
  const feitas = await prisma.dominioExportacao.findMany({
    where: { tenantId, companyId, competencia },
    orderBy: { createdAt: "desc" },
    take: limite,
    select: { id: true, tipo: true, formato: true, linhas: true, createdAt: true, createdById: true },
  });
  const ids = [...new Set(feitas.flatMap((f) => (f.createdById ? [f.createdById] : [])))];
  const pessoas = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nome = new Map(pessoas.map((p) => [p.id, p.name]));
  return feitas.map((f) => ({
    id: f.id,
    tipo: f.tipo === "CORRECAO" ? "CORRECAO" : "COMPLETA",
    formato: f.formato,
    linhas: f.linhas,
    em: f.createdAt,
    por: f.createdById ? (nome.get(f.createdById) ?? null) : null,
  }));
}

/** O que a Domínio tem deste mês, pela última planilha baixada. Nulo se nenhuma foi registrada. */
export async function estadoNaDominio(tenantId: string, companyId: string, competencia: string): Promise<EstadoExportado | null> {
  const ultima = await getPrisma().dominioExportacao.findFirst({
    where: { tenantId, companyId, competencia },
    orderBy: { createdAt: "desc" },
    select: { estado: true },
  });
  return ultima ? lerEstado(ultima.estado) : null;
}

/** A correção do mês contra a última planilha baixada. Nula se ainda não houve nenhuma. */
export async function correcaoDoMes(tenantId: string, companyId: string, competencia: string, atual: { linhas: LinhaDaDominio[] }): Promise<Correcao | null> {
  const anterior = await estadoNaDominio(tenantId, companyId, competencia);
  return anterior ? correcaoEntre(anterior, estadoDasLinhas(atual.linhas)) : null;
}

/**
 * Grava a planilha baixada. O estado é sempre o de AGORA (as linhas de todas
 * as baixas prontas), tanto na completa quanto na correção: depois de
 * importar qualquer uma das duas, é isso que a Domínio tem.
 */
export async function registrarExportacao(p: {
  tenantId: string;
  companyId: string;
  competencia: string;
  tipo: TipoDaExportacao;
  formato: "xlsx" | "txt";
  linhasDoArquivo: number;
  atual: { linhas: LinhaDaDominio[] };
  userId: string | null;
}): Promise<void> {
  await getPrisma().dominioExportacao.create({
    data: {
      tenantId: p.tenantId,
      companyId: p.companyId,
      competencia: p.competencia,
      tipo: p.tipo,
      formato: p.formato,
      linhas: p.linhasDoArquivo,
      estado: estadoDasLinhas(p.atual.linhas) as unknown as Prisma.InputJsonValue,
      createdById: p.userId,
    },
  });
}
