import { MetricCard, type TomDaMetrica } from "./MetricCard";

export type ItemDeTotal = {
  rotulo: string;
  valor: string;
  /**
   * A cor do valor, pelo nome da classe que as telas já passam (`text-danger`,
   * `text-warning-fg`, `text-success-fg`, `text-brand`, `text-fg-muted`). Vira o
   * `tom` do `MetricCard` — vale o nome da cor, então `text-warning` e
   * `text-warning-fg` dão no mesmo. Pinta o ícone junto.
   */
  tom?: string;
  icone?: React.ReactNode;
  /** Linha de apoio embaixo do valor. */
  detalhe?: string;
  /** Torna o cartão um atalho — em /pagar, "Vencido" abre o recorte de vencidas. */
  href?: string;
  /**
   * O recorte que a lista abaixo está mostrando (07/10/2026). Ganha a borda e o
   * fundo da marca e `aria-current`: antes só a frase "mostrando agora" no
   * detalhe dizia qual era, e o cartão parecia igual aos outros.
   */
  ativo?: boolean;
};

/** A classe de cor que a tela passou, lida como o tom do cartão. */
function tomDaClasse(tom?: string): TomDaMetrica | undefined {
  if (!tom) return undefined;
  if (tom.includes("danger")) return "critico";
  if (tom.includes("warning")) return "atencao";
  if (tom.includes("success")) return "ok";
  if (tom.includes("muted")) return "neutro";
  if (tom.includes("brand")) return "marca";
  return undefined;
}

/**
 * Os números do topo das telas — "Em aberto", "Vencidas", "Pago".
 *
 * Um cartão por número (escolha 6B do Kauan na página de decisões, 08/10/2026,
 * contra a faixa única recomendada): cada item é um `MetricCard`, o mesmo
 * cartão da Home e dos indicadores — não há mais dois desenhos de cartão de
 * número. A faixa só arruma a grade e traduz o `tom` de classe para o tom do
 * cartão (vermelho para vencido, âmbar para o que vence, verde para o pago).
 *
 * Histórico: eram quatro células coladas numa grade de 1px (30/09), viraram
 * cartões com o ícone à direita do rótulo, e em 08/10 passaram ao desenho do
 * `MetricCard` (ícone à esquerda), mais espaçados. Mora em `ui/` desde
 * 07/10/2026; o endereço antigo (`financeiro/FiltroDePeriodo`) segue
 * reexportando. A API das telas (as ~35 que usam) não mudou.
 *
 * O ícone automático do tom fica desligado aqui: a faixa mostra só o ícone que
 * a tela deu, para os cartões não ganharem e perderem ícone conforme a contagem.
 */
//
// A grade: dois por linha no celular; no computador, todos numa linha só
// quando cabem — quatro só a partir de `xl`, e o valor em 30px só em `2xl`:
// com a sidebar de 240px, numa tela de 1024px cada cartão ficava com ~170px e
// o valor em reais saía cortado ("R$ 14.0…") — visto no polimento de 30/09.
// Dinheiro não se corta; se ainda assim não couber, `c41-cortavel` dá a dica
// inteira. Nunca rola de lado: o que não cabe desce para a linha de baixo.
// Classes por extenso: o Tailwind não enxerga nome de classe montado em tempo
// de execução.
const COLUNAS: Record<number, string> = {
  2: "xl:grid-cols-2",
  // Três numa linha já no `md` (08/10/2026): no meio do caminho eram dois e um
  // sozinho embaixo. Três cartões (Transferências) ocupam a linha inteira.
  3: "md:grid-cols-3",
  4: "xl:grid-cols-4",
  // As cinco situações do processo do Societário: três por linha no meio do
  // caminho, para não deixar um cartão sozinho numa linha de dois.
  5: "md:grid-cols-3 xl:grid-cols-5",
  // A projeção do fluxo de caixa (seis números): três e três no meio, seis numa
  // linha só a partir de `xl` — com quatro, sobravam dois numa segunda linha.
  6: "md:grid-cols-3 xl:grid-cols-6",
};

/**
 * Qual cartão vira o número principal da tela — cheio de azul, com letra
 * branca (paleta B "Mais azul", escolha do Kauan em 13/10/2026). É o primeiro,
 * que nas telas é o total ("A pagar", "Em aberto"), e só um por faixa. Fica de
 * fora:
 * - faixa de filtro (algum item com `ativo` definido): ali o azul cheio se
 *   confundiria com o recorte escolhido, que já é marcado em azul;
 * - primeiro número com situação (vencido, vence logo, pago, sem situação): a
 *   cor da situação vem antes da ênfase;
 * - faixa de um número só, que não tem o que destacar.
 */
export function indiceDoDestaque(itens: ItemDeTotal[]): number | null {
  if (itens.length < 2) return null;
  if (itens.some((i) => i.ativo !== undefined)) return null;
  const tom = tomDaClasse(itens[0].tom);
  if (tom && tom !== "marca") return null;
  return 0;
}

/**
 * `className` troca o respiro de baixo (padrão `mb-5`): em coluna com `gap`, passe "".
 * `destaque={false}` tira o cartão azul da tela que não quiser (ver `indiceDoDestaque`).
 * `rotulosInteiros` faz os rótulos quebrarem linha em vez de cortar com "…",
 * cada um reservando duas linhas para os valores ficarem na mesma altura (ver
 * `rotuloInteiro` no `MetricCard`) — para rótulo comprido que não pode perder
 * o fim, como o mês em "Desligamentos em setembro".
 */
export function FaixaDeTotais({
  itens,
  className = "mb-5",
  destaque = true,
  rotulosInteiros = false,
}: {
  itens: ItemDeTotal[];
  className?: string;
  destaque?: boolean;
  rotulosInteiros?: boolean;
}) {
  const principal = destaque ? indiceDoDestaque(itens) : null;
  return (
    <div className={`grid grid-cols-2 ${COLUNAS[itens.length] ?? "xl:grid-cols-4"} gap-3 sm:gap-4 ${className}`.trim()}>
      {itens.map((i, n) => (
        <MetricCard
          key={i.rotulo}
          label={i.rotulo}
          value={i.valor}
          href={i.href}
          navegacaoCompleta={i.ativo !== undefined}
          icon={i.icone}
          detalhe={i.detalhe}
          tom={tomDaClasse(i.tom)}
          iconeDoTom={false}
          ativo={i.ativo}
          destaque={n === principal}
          rotuloInteiro={rotulosInteiros}
          delay={n * 40}
        />
      ))}
    </div>
  );
}
