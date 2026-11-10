// A fila de /aprovacoes — o que toca o banco (10/11/2026). O recorte puro
// mora em `fila.ts`.

import { cache } from "react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";
import { empresasAtivasDoSeletor } from "@/lib/financeiro/consultas";
import { SITUACAO_PADRAO_DA_FILA, whereDaFilaDeAprovacoes } from "./fila";

/**
 * A empresa em que a fila abre para quem está logado — `pedida` é o
 * `?empresa=` da URL. A empresa vem da faixa "Trabalhando em" (05/11/2026): a
 * do foco, ou todas sem foco. Com a base inteira (matriz e filiais), a fila
 * fica na empresa em foco — a alçada é de cada empresa.
 *
 * Uma vez por requisição (10/11/2026): o balão da aba "Aprovações" das
 * Solicitações pergunta o mesmo, sem `?empresa=`; na própria tela aberta sem
 * ele, as duas perguntas viram uma consulta só.
 */
export const empresaDaFilaDeAprovacoes = cache(async (pedida: string | undefined) => {
  const ctx = await getAuthContext();
  const empresas = await empresasAtivasDoSeletor(ctx.tenantId);
  const { empresa, foco } = await escolherEmpresaDaTela(ctx, pedida, empresas, { permitirTodas: true, comFoco: true });
  return { foco, empresaId: empresa?.id ?? foco?.companyId ?? null };
});

/**
 * Quantas contas a fila mostra ao abrir, na empresa dela — o balão da aba
 * "Aprovações" das Solicitações (10/11/2026, pedido do Kauan: balão como nos
 * Chamados). O `where` da tela, contado no índice `[tenantId, approvalStatus,
 * companyId]`; a lista para em 500, o balão não.
 */
export async function contarFilaDeAprovacoes(tenantId: string, empresaId: string | null): Promise<number> {
  return getPrisma().financeEntry.count({
    where: { ...whereDaFilaDeAprovacoes(tenantId, empresaId), approvalStatus: { in: [...SITUACAO_PADRAO_DA_FILA.status] } },
  });
}
