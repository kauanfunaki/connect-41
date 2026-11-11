// As conquistas da Academia (Fase 2, 11/11/2026 — Controle interno
// funcionalidade-594): medalhas por marcos, tiradas do que já está gravado
// (resultados, desafios e o Hall dos campeões) — nada novo para guardar. Puro:
// o servidor junta os fatos e as regras dizem o que a pessoa já tem.
//
// As conquistas aparecem só para a própria pessoa, no Início da Academia.

export type FatosDasConquistas = {
  /** Algum resultado valendo, em qualquer teste. */
  temResultado: boolean;
  desafiosFeitos: number;
  maiorSequencia: number;
  /** O maior PPM valendo na digitação (de texto). */
  maiorPpm: number | null;
  /** Alguma rodada de lógica valendo com todas certas. */
  logicaPerfeita: boolean;
  maiorAcertoNosAtalhos: number | null;
  /** Vezes no pódio (1º a 3º) de um teste num mês encerrado, no Hall. */
  podios: number;
  /** Vezes em 1º. */
  primeirosLugares: number;
  /** Vezes com a maior evolução do mês. */
  maioresEvolucoes: number;
};

export type CodigoDaConquista =
  | "primeiro-teste" | "primeiro-desafio" | "sequencia-7" | "sequencia-30" | "ppm-40" | "ppm-60" | "ppm-80"
  | "logica-perfeita" | "atalhos-20" | "podio" | "primeiro-lugar" | "maior-evolucao";

export type DefinicaoDaConquista = { codigo: CodigoDaConquista; titulo: string; descricao: string; tem: (f: FatosDasConquistas) => boolean };

export const CONQUISTAS: readonly DefinicaoDaConquista[] = [
  { codigo: "primeiro-teste", titulo: "Primeiro passo", descricao: "Fez o primeiro teste valendo.", tem: (f) => f.temResultado },
  { codigo: "primeiro-desafio", titulo: "Desafio aceito", descricao: "Fez o primeiro desafio do dia.", tem: (f) => f.desafiosFeitos > 0 },
  { codigo: "sequencia-7", titulo: "Uma semana firme", descricao: "7 dias seguidos no desafio do dia.", tem: (f) => f.maiorSequencia >= 7 },
  { codigo: "sequencia-30", titulo: "Um mês firme", descricao: "30 dias seguidos no desafio do dia.", tem: (f) => f.maiorSequencia >= 30 },
  { codigo: "ppm-40", titulo: "40 PPM", descricao: "Chegou a 40 palavras por minuto na digitação.", tem: (f) => (f.maiorPpm ?? 0) >= 40 },
  { codigo: "ppm-60", titulo: "60 PPM", descricao: "Chegou a 60 palavras por minuto na digitação.", tem: (f) => (f.maiorPpm ?? 0) >= 60 },
  { codigo: "ppm-80", titulo: "80 PPM", descricao: "Chegou a 80 palavras por minuto na digitação.", tem: (f) => (f.maiorPpm ?? 0) >= 80 },
  { codigo: "logica-perfeita", titulo: "Todas certas", descricao: "Acertou todas as questões numa rodada de lógica.", tem: (f) => f.logicaPerfeita },
  { codigo: "atalhos-20", titulo: "Mão no teclado", descricao: "Fez 20 acertos numa rodada de atalhos.", tem: (f) => (f.maiorAcertoNosAtalhos ?? 0) >= 20 },
  { codigo: "podio", titulo: "No pódio", descricao: "Ficou entre os 3 primeiros de um teste num mês.", tem: (f) => f.podios > 0 },
  { codigo: "primeiro-lugar", titulo: "Primeiro lugar", descricao: "Ficou em 1º num teste num mês.", tem: (f) => f.primeirosLugares > 0 },
  { codigo: "maior-evolucao", titulo: "Maior evolução", descricao: "Teve a maior evolução da equipe num mês.", tem: (f) => f.maioresEvolucoes > 0 },
];

export type ConquistaNaTela = { codigo: CodigoDaConquista; titulo: string; descricao: string; tem: boolean };

/** Todas as conquistas, com as que a pessoa já tem primeiro (na ordem do catálogo). */
export function conquistasDe(f: FatosDasConquistas): ConquistaNaTela[] {
  const todas = CONQUISTAS.map((c) => ({ codigo: c.codigo, titulo: c.titulo, descricao: c.descricao, tem: c.tem(f) }));
  return [...todas.filter((c) => c.tem), ...todas.filter((c) => !c.tem)];
}
