import type { OpcoesDoDre } from "@/lib/dre/estrutura";

/**
 * As duas visões dos impostos sobre a receita (20/10/2026, pedido do Kauan):
 * no EBITDA, como o modelo novo fecha — o padrão —, ou fora do resultado. A
 * escolha mora no endereço (`impostos=fora`), então vai
 * junto para a exportação e para quem recebe o link.
 *
 * Era um seletor de dois segmentos na fileira dos filtros. Desde 05/11/2026
 * (escolha 5A do Kauan) é um item do "⋯" do topo, que leva para a outra visão;
 * a visão "fora do resultado" continua dizendo na tela, no aviso do imposto,
 * que é ela que está aberta.
 */
export function trocaDosImpostos(
  opcoes: OpcoesDoDre,
  /** A tela ("/dre", "/dre/economica"). */
  base: string,
  /** O que o endereço já tem — empresa, mês, ano, visão —, para a troca não perder. */
  params: Record<string, string | undefined>
): { href: string; rotulo: string } {
  const paraFora = opcoes.impostosNoEbitda;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v && k !== "impostos") q.set(k, v);
  if (paraFora) q.set("impostos", "fora");
  return {
    href: q.size ? `${base}?${q}` : base,
    rotulo: paraFora ? "Ver com impostos fora do resultado" : "Ver com impostos no EBITDA",
  };
}

/** O sufixo do endereço para a visão escolhida — o que os links da tela acrescentam. */
export function sufixoDosImpostos(opcoes: OpcoesDoDre): string {
  return opcoes.impostosNoEbitda ? "" : "&impostos=fora";
}
