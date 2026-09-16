// A DRE econômica por centro de custo. Função pura, sem banco.
//
// ─── Por que os totais batem sem conta de fechamento ────────────────────────
//
// Cada lançamento tem **um** centro ou nenhum (sem rateio), e cada ajuste da
// cobrança herda um centro ou nenhum. Os grupos do quadro são, portanto, uma
// partição: todo lançamento cai em exatamente uma linha, e "Sem centro de
// custo" é uma linha como as outras. Como o resultado da estrutura da 41 é
// soma de grupos (ver `calculo.ts`), a soma das linhas é a DRE sem filtro — o
// mesmo argumento de linearidade da reconciliação lucro → caixa.

import type { LancamentoDoDre, Mapeamento } from "./calculo";
import { GRUPOS, OPCOES_PADRAO } from "./estrutura";
import { calcularDreEconomica, valorDaLinha, LINHA_DE_RESULTADO, type LancamentoFinanceiro } from "./economica";

export type CentroDoQuadro = { id: string; nome: string; codigo: string | null; active: boolean };

export type LinhaDoQuadroPorCentro = {
  /** `null` é a linha "Sem centro de custo". */
  centroId: string | null;
  nome: string;
  codigo: string | null;
  ativo: boolean;
  receitaBruta: number;
  /** Soma de todos os grupos de pagamento, negativa como na DRE. */
  despesas: number;
  /** A última linha da estrutura — o resultado do período. */
  resultado: number;
  /** Lançamentos que contam na DRE econômica (ajustes da cobrança não contam). */
  lancamentos: number;
};

export type QuadroPorCentro = {
  linhas: LinhaDoQuadroPorCentro[];
  total: Omit<LinhaDoQuadroPorCentro, "centroId" | "nome" | "codigo" | "ativo">;
};

const ORIGEM_PAGAMENTO = GRUPOS.filter((g) => g.origem === "pagamento").map((g) => g.code);

/**
 * O resultado de cada centro num período.
 *
 * Aparecem os centros **ativos** (mesmo zerados — é o cadastro dizendo que o
 * centro existe e não teve movimento) e os inativos **com movimento**: inativo
 * some do seletor, não do relatório. "Sem centro de custo" vai por último, e só
 * quando tem movimento ou quando não há centro nenhum cadastrado.
 */
export function quadroPorCentro(
  lancamentos: LancamentoFinanceiro[],
  ajustes: LancamentoDoDre[],
  mapeamento: Mapeamento,
  centros: CentroDoQuadro[]
): QuadroPorCentro {
  const chave = (id: string | null | undefined) => id ?? "";
  const lancPorCentro = new Map<string, LancamentoFinanceiro[]>();
  const ajustesPorCentro = new Map<string, LancamentoDoDre[]>();
  for (const l of lancamentos) {
    const k = chave(l.centroDeCustoId);
    lancPorCentro.set(k, [...(lancPorCentro.get(k) ?? []), l]);
  }
  for (const a of ajustes) {
    const k = chave(a.centroDeCustoId);
    ajustesPorCentro.set(k, [...(ajustesPorCentro.get(k) ?? []), a]);
  }

  const linhaDe = (centroId: string | null, nome: string, codigo: string | null, ativo: boolean): LinhaDoQuadroPorCentro => {
    const k = chave(centroId);
    const dre = calcularDreEconomica(lancPorCentro.get(k) ?? [], mapeamento, OPCOES_PADRAO, ajustesPorCentro.get(k) ?? []);
    return {
      centroId,
      nome,
      codigo,
      ativo,
      receitaBruta: valorDaLinha(dre.resultado, "receita_bruta"),
      despesas: ORIGEM_PAGAMENTO.reduce((n, g) => n + (dre.resultado.porGrupo[g] ?? 0), 0),
      resultado: valorDaLinha(dre.resultado, LINHA_DE_RESULTADO),
      lancamentos: dre.lancamentos,
    };
  };

  const conhecidos = new Set(centros.map((c) => c.id));
  const temMovimento = (id: string | null) => lancPorCentro.has(chave(id)) || ajustesPorCentro.has(chave(id));

  const linhas: LinhaDoQuadroPorCentro[] = [...centros]
    .filter((c) => c.active || temMovimento(c.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map((c) => linhaDe(c.id, c.nome, c.codigo, c.active));

  // Centro que não está na lista recebida (não deveria acontecer: o centro é
  // da empresa e nunca é apagado) aparece com o id, em vez de o valor sumir e o
  // total deixar de bater.
  for (const k of new Set([...lancPorCentro.keys(), ...ajustesPorCentro.keys()])) {
    if (k !== "" && !conhecidos.has(k)) linhas.push(linhaDe(k, `Centro ${k.slice(0, 8)}`, null, false));
  }

  if (temMovimento(null) || centros.length === 0) linhas.push(linhaDe(null, "Sem centro de custo", null, true));

  const total = linhas.reduce(
    (t, l) => ({
      receitaBruta: t.receitaBruta + l.receitaBruta,
      despesas: t.despesas + l.despesas,
      resultado: t.resultado + l.resultado,
      lancamentos: t.lancamentos + l.lancamentos,
    }),
    { receitaBruta: 0, despesas: 0, resultado: 0, lancamentos: 0 }
  );
  return { linhas, total };
}
