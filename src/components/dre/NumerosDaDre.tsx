// Os números do topo da DRE — de caixa (`/dre`) e econômica (`/dre/economica`).
//
// Escolha 9A do Kauan na página de decisões (08/10/2026): na DRE a tabela fica
// como está, e o padrão novo entra nos números do topo e nos gráficos de
// apoio. Aqui, os quatro números que a econômica já mostrava, agora nas duas
// telas irmãs, com a comparação com o mês anterior quando ele tem movimento —
// sem mês anterior, sem comparação: zero de "não houve" não é base.

import { FaixaDeTotais, type ItemDeTotal } from "@/components/ui/FaixaDeTotais";
import type { ResultadoDoDre } from "@/lib/dre/calculo";
import { valorDaLinha, fracaoDaLinha, LINHA_DE_RESULTADO, LINHA_OPERACIONAL } from "@/lib/dre/economica";
import { quantoMudou } from "@/lib/home/tendencia";
import { moeda, percentual } from "@/lib/financeiro/formato";

/** O resultado do mês anterior e como ele se chama na tela ("Set/26"). */
export type AnteriorDaDre = { resultado: ResultadoDoDre; rotulo: string };

/**
 * A comparação escrita: "▲ 12% sobre Set/26", "▼ R$ 1,2 mil sobre Set/26"
 * (base zero ou negativa não tem percentual), "igual a Set/26". A seta e o
 * texto dizem o sentido; a regra do quanto é a do selo da Home
 * (`quantoMudou`), para os dois lerem igual.
 */
export function comparacaoComAnterior(atual: number, anterior: number, rotulo: string): string {
  const quanto = quantoMudou(atual, anterior, "moeda");
  if (quanto === null) return `igual a ${rotulo}`;
  return `${atual > anterior ? "▲" : "▼"} ${quanto} sobre ${rotulo}`;
}

/**
 * O tom do valor: negativo em vermelho, zero em cinza e o resto em texto
 * neutro — a regra do fluxo de caixa (07/10). O verde do positivo saiu: o
 * resultado ficava verde só pelo sinal, sem dizer se era bom.
 */
function tomDoNumero(centavos: number): string | undefined {
  return centavos < 0 ? "text-danger" : centavos === 0 ? "text-fg-muted" : undefined;
}

/**
 * Os quatro números. Na de caixa, as duas últimas linhas levam os nomes do
 * regime de caixa ("Gerador de caixa operacional", "Fluxo de caixa livre"),
 * como a tabela logo abaixo.
 *
 * A margem leva o percentual no detalhe, e não colado no valor: "R$ 37.645,50
 * · 58,…" cortava no cartão (auditoria dos gráficos, 07/10).
 */
export function itensDosNumerosDaDre(
  resultado: ResultadoDoDre,
  regime: "caixa" | "competencia",
  anterior: AnteriorDaDre | null = null
): ItemDeTotal[] {
  const item = (rotulo: string, code: string, detalhe?: string): ItemDeTotal => {
    const valor = valorDaLinha(resultado, code);
    return { rotulo, valor: moeda(valor), tom: tomDoNumero(valor), detalhe };
  };
  const comparar = (code: string) =>
    anterior ? comparacaoComAnterior(valorDaLinha(resultado, code), valorDaLinha(anterior.resultado, code), anterior.rotulo) : undefined;
  const margem = fracaoDaLinha(resultado, "margem_contribuicao_pct");

  return [
    item("Receita bruta", "receita_bruta", comparar("receita_bruta")),
    item("Margem de contribuição", "margem_contribuicao", margem === null ? undefined : `${percentual(margem)} da receita`),
    item(regime === "caixa" ? "Gerador de caixa operacional" : "Resultado operacional", LINHA_OPERACIONAL, comparar(LINHA_OPERACIONAL)),
    item(regime === "caixa" ? "Fluxo de caixa livre" : "Resultado do período", LINHA_DE_RESULTADO, comparar(LINHA_DE_RESULTADO)),
  ];
}

export function NumerosDaDre({
  resultado,
  regime,
  anterior = null,
  className,
}: {
  resultado: ResultadoDoDre;
  regime: "caixa" | "competencia";
  /** O mês anterior, quando ele teve movimento. Sem ele, os números vão sem comparação. */
  anterior?: AnteriorDaDre | null;
  className?: string;
}) {
  return <FaixaDeTotais itens={itensDosNumerosDaDre(resultado, regime, anterior)} className={className} />;
}
