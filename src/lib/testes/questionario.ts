// O resultado do questionário pergunta a pergunta (14/10/2026, escolha
// "Teste · 3A — Lista de perguntas" do Kauan): a nota em cima, a lista com a
// resposta dada e, quando errou, a certa — e o filtro "Erradas".
//
// A resposta escolhida e a certa já ficam guardadas no resultado
// (`QuizScores.results`); o texto da pergunta e das alternativas vem do modelo
// do teste. Editar um modelo recria as perguntas (`atualizarTemplate`), e as
// respostas antigas deixam de achar a delas: a pergunta aparece sem o texto,
// com a letra da alternativa, em vez de sumir da lista.

import type { QuizScores } from "@/lib/quiz";

export type PerguntaDoModelo = { id: string; order: number; text: string; options: unknown };

export type PerguntaRespondida = {
  /** O número da pergunta no teste (a ordem do modelo). */
  numero: number;
  /** `null` quando a pergunta saiu do modelo depois da resposta. */
  texto: string | null;
  resposta: string;
  certa: string;
  acertou: boolean;
};

export type FiltroDasPerguntas = "todas" | "erradas";

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** "Alternativa B" — quando o texto da alternativa não existe mais. */
export function alternativaPorLetra(indice: number): string {
  return `Alternativa ${LETRAS[indice] ?? indice + 1}`;
}

function textoDaAlternativa(opcoes: unknown, indice: number): string {
  const texto = Array.isArray(opcoes) ? opcoes[indice] : undefined;
  return typeof texto === "string" && texto.trim() !== "" ? texto : alternativaPorLetra(indice);
}

/**
 * As perguntas respondidas, na ordem do modelo; as que o modelo não tem mais
 * vão para o fim, na ordem em que foram respondidas.
 */
export function perguntasRespondidas(scores: QuizScores | null | undefined, modelo: PerguntaDoModelo[]): PerguntaRespondida[] {
  const resultados = Array.isArray(scores?.results) ? scores.results : [];
  const ordenadas = [...modelo].sort((a, b) => a.order - b.order);
  const posicao = new Map(ordenadas.map((q, i) => [q.id, i]));
  const porId = new Map(ordenadas.map((q) => [q.id, q]));

  const linhas = resultados.map((r, i) => {
    const q = porId.get(r.questionId);
    return {
      chave: q ? posicao.get(q.id)! : ordenadas.length + i,
      texto: q?.text ?? null,
      resposta: q ? textoDaAlternativa(q.options, r.selectedIndex) : alternativaPorLetra(r.selectedIndex),
      certa: q ? textoDaAlternativa(q.options, r.correctIndex) : alternativaPorLetra(r.correctIndex),
      acertou: r.correct === true,
    };
  });

  return linhas
    .sort((a, b) => a.chave - b.chave)
    .map((l, i) => ({ numero: i + 1, texto: l.texto, resposta: l.resposta, certa: l.certa, acertou: l.acertou }));
}

export function filtrarPerguntas(lista: PerguntaRespondida[], filtro: FiltroDasPerguntas): PerguntaRespondida[] {
  return filtro === "erradas" ? lista.filter((p) => !p.acertou) : lista;
}

export function contarPerguntas(lista: PerguntaRespondida[]): { todas: number; erradas: number } {
  return { todas: lista.length, erradas: lista.filter((p) => !p.acertou).length };
}
