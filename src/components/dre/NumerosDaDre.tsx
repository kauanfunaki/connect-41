// Os números do topo da DRE — de caixa (`/dre`) e econômica (`/dre/economica`).
//
// Escolha 9A do Kauan na página de decisões (08/10/2026): na DRE a tabela fica
// como está, e o padrão novo entra nos números do topo e nos gráficos de
// apoio. Aqui, os quatro números que a econômica já mostrava, agora nas duas
// telas irmãs, com a comparação com o mês anterior quando ele tem movimento —
// sem mês anterior, sem comparação: zero de "não houve" não é base.

import { BotaoDaDica } from "@/components/dre/BotaoDaDica";
import { FaixaDeTotais, indiceDoDestaque, type ItemDeTotal } from "@/components/ui/FaixaDeTotais";
import { MetricCard, type TomDaMetrica } from "@/components/ui/MetricCard";
import { dicaDaLinha } from "@/lib/dre/dicasDaDre";
import type { ResultadoDoDre } from "@/lib/dre/calculo";
import { valorDaLinha, fracaoDaLinha, modeloDoResultado } from "@/lib/dre/economica";
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
 * Os quatro números. As duas últimas são a linha operacional e a de resultado
 * do modelo do DRE da empresa (21/10/2026), com os nomes do regime — no
 * padrão, "Gerador de caixa (EBITDA)" e "Resultado líquido operacional" na de
 * caixa —, como a tabela logo abaixo.
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
  const modelo = modeloDoResultado(resultado);
  const [operacional, final] = modelo.numeros[regime];

  return [
    item("Receita bruta", "receita_bruta", comparar("receita_bruta")),
    item("Margem de contribuição", "margem_contribuicao", margem === null ? undefined : `${percentual(margem)} da receita`),
    item(operacional, modelo.linhaOperacional, comparar(modelo.linhaOperacional)),
    item(final, modelo.linhaDoResultado, comparar(modelo.linhaDoResultado)),
  ];
}

/** As linhas dos quatro números, na ordem de `itensDosNumerosDaDre`. */
export function codigosDosNumerosDaDre(resultado: ResultadoDoDre): string[] {
  const modelo = modeloDoResultado(resultado);
  return ["receita_bruta", "margem_contribuicao", modelo.linhaOperacional, modelo.linhaDoResultado];
}

/** O tom do cartão pela classe que o item traz — só os dois que a DRE usa. */
function tomDoCartao(tom: string | undefined): TomDaMetrica | undefined {
  if (tom?.includes("danger")) return "critico";
  if (tom?.includes("muted")) return "neutro";
  return undefined;
}

export function NumerosDaDre({
  resultado,
  regime,
  anterior = null,
  className,
  dicas = false,
}: {
  resultado: ResultadoDoDre;
  regime: "caixa" | "competencia";
  /** O mês anterior, quando ele teve movimento. Sem ele, os números vão sem comparação. */
  anterior?: AnteriorDaDre | null;
  className?: string;
  /**
   * Um "?" no canto de cada cartão, com a frase do que é aquele número
   * (11/11/2026, P16) — a DRE do cliente: "Margem de contribuição" e "EBITDA"
   * não diziam nada ao dono da empresa. A equipe segue com a faixa de sempre.
   */
  dicas?: boolean;
}) {
  const itens = itensDosNumerosDaDre(resultado, regime, anterior);
  if (!dicas) return <FaixaDeTotais itens={itens} className={className} />;

  // A mesma grade e o mesmo destaque da `FaixaDeTotais` (quatro cartões: dois
  // por linha, quatro do `xl` em diante), com a dica no `canto` do cartão — a
  // faixa não tem onde pô-la.
  const codigos = codigosDosNumerosDaDre(resultado);
  const principal = indiceDoDestaque(itens);
  return (
    <div className={`grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 ${className ?? "mb-5"}`.trim()}>
      {itens.map((i, n) => {
        const dica = dicaDaLinha(codigos[n] ?? "");
        const destaque = n === principal;
        return (
          <MetricCard
            key={i.rotulo}
            label={i.rotulo}
            value={i.valor}
            detalhe={i.detalhe}
            tom={tomDoCartao(i.tom)}
            iconeDoTom={false}
            destaque={destaque}
            delay={n * 40}
            canto={dica ? <BotaoDaDica rotulo={i.rotulo} dica={dica} sobreAzul={destaque} /> : undefined}
          />
        );
      })}
    </div>
  );
}
