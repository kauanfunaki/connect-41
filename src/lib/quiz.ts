// Pontuação de teste de múltipla escolha (templates reutilizáveis, ao
// contrário do DISC que tem banco de palavras fixo em código). Cada pergunta
// tem 1 resposta certa; a nota final é a % de acertos.

export type QuizAnswer = { questionId: string; selectedIndex: number };

export type QuizQuestionResult = {
  questionId: string;
  selectedIndex: number;
  correctIndex: number;
  correct: boolean;
};

export type QuizScores = {
  total: number;
  correct: number;
  pct: number; // 0-100, arredondado
  results: QuizQuestionResult[];
};

function isQuizAnswerShape(v: unknown): v is { questionId: unknown; selectedIndex: unknown } {
  return typeof v === "object" && v !== null && "questionId" in v && "selectedIndex" in v;
}

// Valida a resposta bruta recebida do público: precisa ter exatamente uma
// resposta por pergunta do template (sem repetir, sem faltar, sem referenciar
// pergunta inexistente), com índice dentro do número de opções daquela pergunta.
export function validateQuizAnswers(
  raw: unknown,
  questions: { id: string; options: unknown }[]
): QuizAnswer[] | null {
  if (!Array.isArray(raw) || raw.length !== questions.length) return null;

  const optionCountByQuestion = new Map(
    questions.map((q) => [q.id, Array.isArray(q.options) ? q.options.length : 0])
  );
  const seen = new Set<string>();
  const answers: QuizAnswer[] = [];

  for (const item of raw) {
    if (!isQuizAnswerShape(item)) return null;
    const { questionId, selectedIndex } = item;
    if (typeof questionId !== "string" || !optionCountByQuestion.has(questionId)) return null;
    if (seen.has(questionId)) return null;
    if (typeof selectedIndex !== "number" || !Number.isInteger(selectedIndex)) return null;
    const optionCount = optionCountByQuestion.get(questionId)!;
    if (selectedIndex < 0 || selectedIndex >= optionCount) return null;
    seen.add(questionId);
    answers.push({ questionId, selectedIndex });
  }

  return seen.size === questions.length ? answers : null;
}

export function scoreQuiz(
  answers: QuizAnswer[],
  questions: { id: string; correctIndex: number }[]
): QuizScores {
  const correctIndexByQuestion = new Map(questions.map((q) => [q.id, q.correctIndex]));

  const results: QuizQuestionResult[] = answers.map((a) => {
    const correctIndex = correctIndexByQuestion.get(a.questionId) ?? -1;
    return {
      questionId: a.questionId,
      selectedIndex: a.selectedIndex,
      correctIndex,
      correct: a.selectedIndex === correctIndex,
    };
  });

  const total = questions.length;
  const correct = results.filter((r) => r.correct).length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  return { total, correct, pct, results };
}
