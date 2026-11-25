// O que a aba "Categorias do cliente" do Fluxo de caixa lê (25/11/2026).
//
// Tudo de uma empresa: as categorias do cliente dela, as categorias do Omie do
// plano dela (as do padrão do escritório e as próprias) com a ligação de cada
// uma, e as outras empresas do escritório que já têm de-para, para o "copiar".

import { getPrisma } from "@/lib/prisma";
import { ondeDaEmpresa, padraoAntesDaEmpresa } from "@/lib/financeiro/planoDeContas";
import { sugerirLinha } from "./sugestao";
import type { CategoriaDoPlano } from "./dePara";

export type CategoriaDoClienteNaTela = { id: string; nome: string; linha: string; ligadas: number };

export type CategoriaDoOmieNaTela = {
  id: string;
  nome: string;
  kind: "PAGAR" | "RECEBER";
  codigo: string | null;
  /** A categoria do cliente ligada, ou nula. */
  clienteId: string | null;
  /** A linha que o fluxo usa enquanto não há categoria do cliente. */
  sugerida: string;
};

export type DadosDasCategoriasDoCliente = {
  categoriasDoCliente: CategoriaDoClienteNaTela[];
  categoriasDoOmie: CategoriaDoOmieNaTela[];
  /** Outras empresas do escritório com de-para, para copiar. */
  empresasComDePara: { id: string; nome: string }[];
};

/** O plano de contas da empresa como o de-para casa: ativas, sem as escondidas. */
export async function planoDaEmpresaParaODePara(tenantId: string, companyId: string): Promise<CategoriaDoPlano[]> {
  const categorias = await getPrisma().financeCategory.findMany({
    where: ondeDaEmpresa(tenantId, companyId),
    select: { id: true, name: true, kind: true, omieCode: true, companyId: true },
    orderBy: { name: "asc" },
  });
  // A da empresa depois da do padrão: no de-para por nome, a dela vence.
  return padraoAntesDaEmpresa(categorias);
}

export async function dadosDasCategoriasDoCliente(tenantId: string, companyId: string): Promise<DadosDasCategoriasDoCliente> {
  const prisma = getPrisma();
  const [plano, doCliente, ligacoes, outras] = await Promise.all([
    planoDaEmpresaParaODePara(tenantId, companyId),
    prisma.clientCategory.findMany({
      where: { tenantId, companyId },
      select: { id: true, name: true, line: true, _count: { select: { mappings: true } } },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    }),
    prisma.clientCategoryMapping.findMany({
      where: { tenantId, companyId },
      select: { categoryId: true, clientCategoryId: true },
    }),
    prisma.clientCategory.groupBy({
      by: ["companyId"],
      where: { tenantId, companyId: { not: companyId } },
    }),
  ]);
  const ligadaA = new Map(ligacoes.map((l) => [l.categoryId, l.clientCategoryId]));
  const nomes = outras.length
    ? await prisma.company.findMany({
        where: { tenantId, id: { in: outras.map((o) => o.companyId) } },
        select: { id: true, name: true, tradeName: true },
        orderBy: { name: "asc" },
      })
    : [];

  return {
    categoriasDoCliente: doCliente.map((c) => ({ id: c.id, nome: c.name, linha: c.line, ligadas: c._count.mappings })),
    categoriasDoOmie: plano
      .map((c) => ({
        id: c.id,
        nome: c.name,
        kind: c.kind,
        codigo: c.omieCode,
        clienteId: ligadaA.get(c.id) ?? null,
        sugerida: sugerirLinha(c.name, c.kind),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") || a.kind.localeCompare(b.kind)),
    empresasComDePara: nomes.map((n) => ({ id: n.id, nome: n.tradeName || n.name })),
  };
}
