// Banco de palavras do teste DISC — forced-choice clássico. 24 blocos, 4
// palavras por bloco (uma por dimensão D/I/S/C). Adjetivos em português,
// autorais, não reproduzem texto de nenhum instrumento comercial de marca
// registrada.
//
// ATENÇÃO — append-only: AssessmentLink.answers referencia palavras por
// ÍNDICE DE POSIÇÃO (block, maisIndex, menosIndex), não pelo texto. Uma vez
// que qualquer tenant tenha respostas reais, este arquivo não pode ter blocos
// reordenados/editados — só receber blocos novos no fim, se algum dia for
// necessário.

export type DiscDimension = "D" | "I" | "S" | "C";
export type DiscWord = { word: string; dim: DiscDimension };

export const TOTAL_BLOCKS = 24;

// 24 palavras por dimensão, balanceadas e não-ambíguas.
const WORDS: Record<DiscDimension, string[]> = {
  D: [
    "Decidido", "Direto", "Competitivo", "Ousado", "Enérgico", "Determinado",
    "Assertivo", "Audacioso", "Independente", "Exigente", "Firme", "Corajoso",
    "Impaciente", "Dominante", "Confiante", "Resoluto", "Ambicioso", "Autoritário",
    "Destemido", "Combativo", "Objetivo", "Pioneiro", "Impetuoso", "Enfático",
  ],
  I: [
    "Comunicativo", "Entusiasta", "Sociável", "Persuasivo", "Otimista", "Expressivo",
    "Espontâneo", "Amigável", "Carismático", "Extrovertido", "Animado", "Falante",
    "Caloroso", "Inspirador", "Divertido", "Popular", "Envolvente", "Encantador",
    "Vibrante", "Acolhedor", "Empolgado", "Cativante", "Simpático", "Efusivo",
  ],
  S: [
    "Paciente", "Calmo", "Leal", "Constante", "Previsível", "Gentil",
    "Cooperativo", "Confiável", "Estável", "Tranquilo", "Acomodado", "Ponderado",
    "Dedicado", "Consistente", "Modesto", "Perseverante", "Amável", "Sereno",
    "Cuidadoso", "Compreensivo", "Receptivo", "Conciliador", "Discreto", "Complacente",
  ],
  C: [
    "Analítico", "Preciso", "Meticuloso", "Organizado", "Criterioso", "Sistemático",
    "Cauteloso", "Detalhista", "Metódico", "Lógico", "Rigoroso", "Disciplinado",
    "Formal", "Reservado", "Exato", "Cético", "Reflexivo", "Minucioso",
    "Diplomático", "Perfeccionista", "Racional", "Prudente", "Ordeiro", "Convencional",
  ],
};

// Ordem de exibição das 4 dimensões dentro do bloco — varia por bloco pra
// que a posição nunca revele a dimensão a um respondente atento a padrões.
const ORDERS: DiscDimension[][] = [
  ["D", "I", "S", "C"],
  ["I", "S", "C", "D"],
  ["S", "C", "D", "I"],
  ["C", "D", "I", "S"],
  ["I", "D", "C", "S"],
  ["C", "S", "I", "D"],
];

export const DISC_BANK: DiscWord[][] = Array.from({ length: TOTAL_BLOCKS }, (_, i) => {
  const order = ORDERS[i % ORDERS.length]!;
  return order.map((dim) => ({ word: WORDS[dim][i]!, dim }));
});
