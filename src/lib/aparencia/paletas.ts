// A paleta de cada pessoa (30/10/2026), como os temas do Slack: decisão do
// Kauan na página de tema e foco — fazer depois do modo escuro Ardósia.
//
// A paleta troca a cor de destaque (botão, aba ativa, item do menu, link) e o
// tom da lateral, só para quem escolheu, nos dois temas. As cores das áreas
// (Financeiro, Fiscal…) não mudam: marcam o lugar, não o gosto. Por cima da
// cor principal do escritório — sem paleta escolhida, vale a dele.
//
// O contraste vem de `variaveisDaMarca`, o mesmo cálculo da cor do escritório:
// a cor é escurecida ou clareada até ler (AA) em cada tema. A cor própria que
// nem assim vira destaque — quase branca, quase preta, cinza sem cor — é
// recusada, porque viraria um cinza que ninguém escolheu.

import { corCanonica, misturar, tonsDaCor, variaveisDaMarca, type VariaveisPorTema } from "./cores";

export type Paleta = { codigo: string; nome: string; cor: string };

/** As paletas prontas, na ordem do seletor. A primeira é o azul de sempre. */
export const PALETAS: readonly Paleta[] = [
  { codigo: "41", nome: "41", cor: "#1F5EEA" },
  { codigo: "oceano", nome: "Oceano", cor: "#0B7A8A" },
  { codigo: "floresta", nome: "Floresta", cor: "#2F7D4F" },
  { codigo: "ameixa", nome: "Ameixa", cor: "#6D3FC0" },
  { codigo: "terracota", nome: "Terracota", cor: "#B4492A" },
  { codigo: "grafite", nome: "Grafite", cor: "#3F4B5E" },
];

/** A paleta pronta desta cor, ou `null` (cor própria). */
export function paletaDaCor(cor: string | null): Paleta | null {
  const c = corCanonica(cor);
  return c ? (PALETAS.find((p) => p.cor === c) ?? null) : null;
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/**
 * A cor serve de destaque? Devolve o motivo quando não. As prontas passam;
 * a própria precisa ter cor (saturação) e não ser quase branca nem quase preta.
 */
export function motivoDaCorRecusada(valor: unknown): string | null {
  const c = corCanonica(valor);
  if (!c || !tonsDaCor(c)) return "Cor inválida.";
  const [r, g, b] = rgb(c);
  const maior = Math.max(r, g, b);
  const menor = Math.min(r, g, b);
  const luz = (maior + menor) / 2;
  const saturacao = maior === menor ? 0 : (maior - menor) / (1 - Math.abs(2 * luz - 1));
  if (luz > 0.92) return "Essa cor é quase branca: não daria destaque. Escolha uma mais viva.";
  if (luz < 0.08) return "Essa cor é quase preta: não daria destaque. Escolha uma mais viva.";
  if (saturacao < 0.15) return "Essa cor é um cinza: viraria um destaque apagado. Escolha uma com mais cor.";
  return null;
}

/** As variáveis da paleta: a marca nos dois temas e o tom da lateral. */
export function variaveisDaPaleta(cor: string): VariaveisPorTema | null {
  const marca = variaveisDaMarca(cor);
  const tons = tonsDaCor(cor);
  if (!marca || !tons) return null;
  return {
    comum: marca.comum,
    // A lateral só ganha um fio da cor: o texto do menu continua lendo igual.
    claro: { ...marca.claro, "--c41-sidebar-bg": misturar("#FFFFFF", tons.solida, 0.04) },
    escuro: { ...marca.escuro, "--c41-sidebar-bg": misturar("#181D29", tons.solida, 0.07) },
  };
}
