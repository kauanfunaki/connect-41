"use server";

// Os valores de um funil das colunas de Contas a pagar e a receber, pedidos
// quando o funil abre (13/11/2026). Ver `opcoesDoFunil` e `FiltroDaColunaNaUrl`.

import { getAuthContext } from "@/lib/auth/context";
import { leituraNoFoco } from "@/lib/empresas/focoServidor";
import { MODULO_DO_TIPO } from "./acessoDaConta";
import { podeUsarATelaDeContas } from "./acessoDaTelaDeContas";
import { opcoesDoFunil, type OpcaoDoFunilDeContas } from "./data";
import { recorteDaUrl } from "./exportacao";
import { ehChaveDoFunil, funisDaConsulta } from "./paginaDeContas";

/**
 * O funil de uma coluna: os valores, com a contagem de cada um, do recorte da
 * tela — empresa, competência, situação e os funis das outras colunas.
 *
 * Tudo vem do navegador, então tudo é conferido: o tipo e a coluna contra a
 * lista, o acesso pelo portão da tela, a empresa pelo foco (como a
 * exportação) e os filtros pelos mesmos leitores da página. A consulta é
 * sempre do tenant de quem pede.
 */
export async function valoresDoFunilDasContas(
  kind: unknown,
  chave: unknown,
  empresa: unknown,
  consulta: unknown
): Promise<OpcaoDoFunilDeContas[] | { erro: string }> {
  if (kind !== "PAGAR" && kind !== "RECEBER") return { erro: "Tela desconhecida." };
  if (typeof chave !== "string" || !ehChaveDoFunil(chave)) return { erro: "Coluna desconhecida." };
  if (typeof empresa !== "string" || !empresa) return { erro: "Escolha a empresa (ou todas) antes de filtrar." };

  const ctx = await getAuthContext();
  if (!(await podeUsarATelaDeContas(ctx, MODULO_DO_TIPO[kind]))) return { erro: "Sem acesso a esta tela." };
  const noFoco = await leituraNoFoco(ctx, empresa);
  if (!noFoco.ok) return { erro: noFoco.erro };

  const q = new URLSearchParams(typeof consulta === "string" ? consulta : "");
  const competencia = /^\d{4}-\d{2}$/.test(q.get("competencia") ?? "") ? q.get("competencia")! : undefined;
  return opcoesDoFunil(
    ctx.tenantId,
    kind,
    { recorte: recorteDaUrl(kind, q.get("recorte")), competencia, empresaId: noFoco.empresaId, empresaIds: noFoco.empresaIds, funis: funisDaConsulta(q) },
    chave,
    new Date()
  );
}
