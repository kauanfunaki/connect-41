// O efeito da cobrança na DRE econômica. Função pura, sem banco.
//
// ─── A regra do Kauan (16/09) ───────────────────────────────────────────────
//
// A receita de uma competência **não pode mudar** porque um título dela foi
// renegociado ou perdido meses depois. Então:
//
// - **original renegociado** continua sendo receita na competência dele;
// - **original perdido** também — a perda é outro fato, noutra data;
// - **parcela de acordo** não é receita: é o recebimento de uma receita que já
//   está no original. Contá-la dobraria a receita;
// - **a diferença do acordo** (acordado − originais) é reconhecida na
//   competência da data do acordo: acréscimo como receita, desconto como
//   despesa;
// - **a perda** é despesa na competência da data da perda, pelo valor do
//   título perdido.
//
// ─── Onde entram na estrutura da 41 ─────────────────────────────────────────
//
// Nos grupos não operacionais que já existem, e não em grupos novos:
//
// - acréscimo de acordo → `outras_receitas` (OUTRAS RECEITAS TOTAIS);
// - desconto de acordo  → `outras_despesas` (OUTRAS DESPESAS TOTAIS);
// - perda com clientes  → `outras_despesas`.
//
// Os doze grupos de `estrutura.ts` são o modelo gerencial fixo da 41, e todo
// comparativo, forecast, cenário e indicador do CFO lê os mesmos doze. Um grupo
// novo passaria a existir em todas essas telas e no de-para de categoria, onde
// não faz sentido (ninguém classifica categoria como "perda de acordo"). Os
// dois ficam **abaixo** do resultado operacional, então a margem e o gerador
// de caixa continuam batendo com a planilha — e chegam ao RESULTADO DO PERÍODO,
// que é onde juros de renegociação e inadimplência pertencem numa leitura
// gerencial. `Despesas Fixas (Financeiras)` foi descartado: é tarifa e juro
// recorrente da operação, e entraria no total de despesas fixas.
//
// Os valores entram como **lançamentos próprios** (grupo fixo, sem categoria)
// e o `resumo` os devolve separados, para a tela dizer quanto das outras
// receitas e despesas é cobrança.

import type { LancamentoDoDre } from "@/lib/dre/calculo";
import type { MotivoDeEncerramento, StatusDoAcordo, StatusDoLancamento } from "./regras";

export const GRUPO_DO_ACRESCIMO_DE_ACORDO = "outras_receitas";
export const GRUPO_DO_DESCONTO_DE_ACORDO = "outras_despesas";
export const GRUPO_DA_PERDA = "outras_despesas";

export type LancamentoNaCobranca = {
  status: StatusDoLancamento;
  closeReason?: MotivoDeEncerramento | null;
  /** É parcela de um acordo. */
  parcelaDeAcordo?: boolean;
};

/** O lançamento entra na DRE econômica da competência dele? */
export function contaNaDreEconomica(l: LancamentoNaCobranca): boolean {
  if (l.parcelaDeAcordo) return false;
  if (l.status !== "CANCELADO") return true;
  return l.closeReason === "RENEGOCIADO" || l.closeReason === "PERDA";
}

export type AcordoNaDre = {
  /** Competência "AAAA-MM" da data do acordo, em São Paulo. */
  competencia: string;
  status: StatusDoAcordo;
  originalCentavos: number;
  acordadoCentavos: number;
};

export type PerdaNaDre = {
  /** Competência "AAAA-MM" da data da perda, em São Paulo. */
  competencia: string;
  centavos: number;
};

/**
 * Os lançamentos que a cobrança acrescenta à DRE econômica de uma competência.
 *
 * Acordo **desfeito** não entra: desfazer devolve os originais ao em aberto, e
 * a diferença de um acordo que deixou de existir não é resultado de ninguém.
 * Acordo **quebrado** entra: a renegociação aconteceu, e a dívida que sobrou
 * está nas parcelas pelo valor acordado.
 */
export function ajustesDaCobranca(acordos: AcordoNaDre[], perdas: PerdaNaDre[], competencia: string): LancamentoDoDre[] {
  const saida: LancamentoDoDre[] = [];
  for (const a of acordos) {
    if (a.competencia !== competencia || a.status === "DESFEITO") continue;
    const diferenca = a.acordadoCentavos - a.originalCentavos;
    if (diferenca > 0) {
      saida.push({ categoria: null, grupo: GRUPO_DO_ACRESCIMO_DE_ACORDO, valorCentavos: diferenca, origem: "recebimento" });
    } else if (diferenca < 0) {
      saida.push({ categoria: null, grupo: GRUPO_DO_DESCONTO_DE_ACORDO, valorCentavos: diferenca, origem: "pagamento" });
    }
  }
  for (const p of perdas) {
    if (p.competencia !== competencia || p.centavos === 0) continue;
    saida.push({ categoria: null, grupo: GRUPO_DA_PERDA, valorCentavos: -Math.abs(p.centavos), origem: "pagamento", perda: true });
  }
  return saida;
}

export type ResumoDaCobrancaNaDre = {
  /** Positivo. */
  acrescimosDeAcordo: number;
  /** Negativo, como na DRE. */
  descontosDeAcordo: number;
  /** Negativo, como na DRE. */
  perdas: number;
};

export function resumoDaCobrancaNaDre(ajustes: LancamentoDoDre[]): ResumoDaCobrancaNaDre {
  const r: ResumoDaCobrancaNaDre = { acrescimosDeAcordo: 0, descontosDeAcordo: 0, perdas: 0 };
  for (const a of ajustes) {
    if (a.perda) r.perdas += a.valorCentavos;
    else if (a.valorCentavos > 0) r.acrescimosDeAcordo += a.valorCentavos;
    else r.descontosDeAcordo += a.valorCentavos;
  }
  return r;
}
