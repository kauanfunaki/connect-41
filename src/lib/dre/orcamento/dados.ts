// A leitura do orçamento no banco. As regras são puras e moram ao lado
// (`grade.ts`, `variacao.ts`, `versoes.ts`); aqui só a busca.

import { getPrisma } from "@/lib/prisma";
import { isModuleEnabled } from "@/lib/modules";
import { centavosDeDecimal } from "@/lib/dre/data";
import { gradeDeLinhas, type Grade } from "./grade";
import { versaoAprovada } from "./versoes";

export const MODULO_DE_ORCAMENTO = "dre_orcamento";

export type OrcamentoAprovado = { id: string; nome: string; ano: number; grade: Grade };

/**
 * A versão aprovada de cada ano pedido, com a grade. Ano sem aprovada fica
 * fora do mapa — quem lê decide entre "sem orçamento" e esconder a coluna.
 */
export async function orcamentosAprovados(tenantId: string, companyId: string, anos: number[]): Promise<Map<number, OrcamentoAprovado>> {
  const saida = new Map<number, OrcamentoAprovado>();
  const unicos = [...new Set(anos)];
  if (unicos.length === 0) return saida;
  const versoes = await getPrisma().budget.findMany({
    where: { tenantId, companyId, year: { in: unicos }, status: "APROVADO" },
    select: {
      id: true,
      name: true,
      year: true,
      status: true,
      approvedAt: true,
      lines: { select: { groupCode: true, month: true, amount: true } },
    },
  });
  for (const ano of unicos) {
    const v = versaoAprovada(versoes.filter((x) => x.year === ano));
    if (!v) continue;
    saida.set(ano, {
      id: v.id,
      nome: v.name,
      ano,
      grade: gradeDeLinhas(v.lines.map((l) => ({ groupCode: l.groupCode, month: l.month, centavos: centavosDeDecimal(l.amount) }))),
    });
  }
  return saida;
}

/**
 * O orçado entra nas telas de DRE? Só com o módulo ligado: desligado, nenhuma
 * tela fala de orçamento (nem o aviso de "sem versão aprovada").
 */
export async function orcamentoLigado(tenantId: string): Promise<boolean> {
  return isModuleEnabled(tenantId, MODULO_DE_ORCAMENTO);
}
