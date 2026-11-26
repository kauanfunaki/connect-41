// A consolidação dos lançamentos do Razão de fornecedores (ConcilPro, Bloco D, Fase D3a, 26/11/2026).
// Porte de `src/domain/concilpro/consolidador.py` do Contábil Core.
//
// Quando uma nota é lançada em várias contas de custo, o sistema contábil cria vários lançamentos da
// mesma nota na mesma data. As COMPRAS com o mesmo número, a mesma série e a mesma data viram uma só,
// com o crédito somado; os pagamentos nunca são somados (pode haver vários no mesmo dia).

import { somaTodos } from "../motor/decimal";
import { re, strip } from "../extrato/py";
import type { FornecedorDoRazao, LancamentoDoRazao, RazaoDeFornecedores } from "./leitor";

const SERIE_DA_NOTA = re("\\bS[ÉE]R(?:IE|\\.)?\\s*(?:N[ºO]\\s*)?[:#-]?\\s*([A-Z0-9][A-Z0-9./-]*)", "i");

/** `_serie_da_nota`: a série explícita (`serie_nf` ou `serie`) ou a do histórico ("SÉRIE 1", "SER. A"), em maiúsculas. */
export function serieDaNota(l: Pick<LancamentoDoRazao, "historico" | "serieNf" | "serie">): string {
  const explicita = l.serieNf || l.serie;
  if (explicita !== null && explicita !== undefined && strip(explicita)) return strip(explicita).toUpperCase();
  const m = SERIE_DA_NOTA.search(l.historico || "");
  return m ? m[1]!.toUpperCase() : "";
}

/**
 * `consolidar_lancamentos_fornecedor`: as compras com o mesmo número de nota, a mesma série e o mesmo DIA
 * viram a primeira delas, com o crédito somado, `consolidado` e a quantidade; a compra sem nota fica
 * sozinha. Depois, compras e os demais, pela data (ordenação estável).
 */
export function consolidarLancamentosFornecedor(lancamentos: readonly LancamentoDoRazao[]): LancamentoDoRazao[] {
  const compras = lancamentos.filter((l) => l.tipoOperacao === "COMPRA");
  const outros = lancamentos.filter((l) => l.tipoOperacao !== "COMPRA");
  const grupos = new Map<string, LancamentoDoRazao[]>();
  compras.forEach((l, k) => {
    const chave = l.numeroNf ? JSON.stringify([l.numeroNf, strip(serieDaNota(l)), l.dataLancamento.slice(0, 10)]) : `sem-nf:${k}`;
    const grupo = grupos.get(chave);
    if (grupo) grupo.push(l);
    else grupos.set(chave, [l]);
  });
  const consolidadas: LancamentoDoRazao[] = [];
  for (const grupo of grupos.values()) {
    if (grupo.length === 1) consolidadas.push(grupo[0]);
    else {
      consolidadas.push({
        ...grupo[0],
        valorCredito: somaTodos(grupo.map((l) => l.valorCredito)),
        consolidado: true,
        lancamentosOriginais: grupo.length,
      });
    }
  }
  // `sort(key=data_lancamento)`: o texto "AAAA-MM-DD HH:MM:SS" ordena como o `datetime`.
  return [...consolidadas, ...outros].map((l, i) => ({ l, i })).sort((a, b) => (a.l.dataLancamento < b.l.dataLancamento ? -1 : a.l.dataLancamento > b.l.dataLancamento ? 1 : a.i - b.i)).map((x) => x.l);
}

/**
 * `consolidar_todos_fornecedores`: a consolidação em cada fornecedor. O total declarado zerado (ou ausente)
 * vira a soma dos lançamentos consolidados.
 */
export function consolidarTodosFornecedores(dados: RazaoDeFornecedores): RazaoDeFornecedores {
  const fornecedores = dados.fornecedores.map((f): FornecedorDoRazao => {
    const lancamentos = consolidarLancamentosFornecedor(f.lancamentos);
    return {
      ...f,
      lancamentos,
      totalCredito: f.totalCredito.coeficiente === BigInt(0) ? somaTodos(lancamentos.map((l) => l.valorCredito)) : f.totalCredito,
      totalDebito: f.totalDebito.coeficiente === BigInt(0) ? somaTodos(lancamentos.map((l) => l.valorDebito)) : f.totalDebito,
    };
  });
  return { ...dados, fornecedores };
}
