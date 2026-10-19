// A busca do "Escolher lançamentos" da conciliação (19/10, pedido do BPO:
// "quando for buscar pagamentos, incluir na pesquisa valor e data"). Função
// pura: lê o que a pessoa digitou e diz o que procurar.
//
// Cada palavra vira um critério, e o lançamento tem de passar em todos —
// "localiza 15/10" é a Localiza naquele dia. O critério depende da forma:
//
// - **data** ("15/10", "15/10/2026", "15/10/26", "2026-10-15") casa com o
//   vencimento, o pagamento ou a emissão naquele dia. Sem ano, o do extrato;
// - **valor** ("150,00", "1.234,56", "R$ 150") casa com o valor exato;
// - **número inteiro** ("150", "041") é ambíguo — o valor R$ 150,00 ou um
//   pedaço de nome, descrição ou número do documento — e casa com qualquer um;
// - **o resto** procura no nome da contraparte, na descrição e no número do
//   documento.

import { centavosDeTexto } from "../manual";
import { dataValida } from "../periodo";

export type CriterioDaBusca =
  | { tipo: "data"; dataKey: string }
  | { tipo: "valor"; centavos: number }
  | { tipo: "inteiro"; centavos: number; texto: string }
  | { tipo: "texto"; texto: string };

/** Mais que isso é colar um parágrafo — as primeiras bastam. */
const MAXIMO_DE_CRITERIOS = 6;

function dataDoToken(token: string, anoPadrao: number): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(token);
  if (iso) return dataValida(token);
  const br = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(token);
  if (!br) return null;
  const ano = br[3] ? (br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3])) : anoPadrao;
  return dataValida(`${ano}-${br[2]!.padStart(2, "0")}-${br[1]!.padStart(2, "0")}`);
}

/**
 * Os critérios da busca. `anoPadrao` é o ano da linha do extrato: "15/10"
 * digitado olhando um extrato de outubro é desse outubro.
 */
export function lerBuscaDaEscolha(entrada: string | null | undefined, anoPadrao: number): CriterioDaBusca[] {
  const tokens = (entrada ?? "")
    .trim()
    // "R$ 150" é um valor só, não "R$" e "150".
    .replace(/R\$\s+/gi, "R$")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAXIMO_DE_CRITERIOS);

  return tokens.map((token): CriterioDaBusca => {
    const data = dataDoToken(token, anoPadrao);
    if (data) return { tipo: "data", dataKey: data };

    const pareceDinheiro = /^(R\$)?[\d.,]+$/i.test(token) && /\d/.test(token);
    if (pareceDinheiro) {
      const centavos = centavosDeTexto(token);
      if (centavos !== null && centavos > 0) {
        return /^\d+$/.test(token) ? { tipo: "inteiro", centavos, texto: token } : { tipo: "valor", centavos };
      }
    }
    return { tipo: "texto", texto: token.slice(0, 80) };
  });
}
