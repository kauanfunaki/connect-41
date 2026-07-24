import { describe, expect, it } from "vitest";
import { scoreQuiz, validateQuizAnswers } from "./quiz";

const QUESTIONS = [
  { id: "q1", options: ["a", "b", "c"], correctIndex: 1 },
  { id: "q2", options: ["a", "b"], correctIndex: 0 },
  { id: "q3", options: ["a", "b", "c", "d"], correctIndex: 3 },
];

describe("scoreQuiz", () => {
  it("100% quando tudo certo", () => {
    const answers = [
      { questionId: "q1", selectedIndex: 1 },
      { questionId: "q2", selectedIndex: 0 },
      { questionId: "q3", selectedIndex: 3 },
    ];
    const result = scoreQuiz(answers, QUESTIONS);
    expect(result).toMatchObject({ total: 3, correct: 3, pct: 100 });
    expect(result.results.every((r) => r.correct)).toBe(true);
  });

  it("0% quando tudo errado", () => {
    const answers = [
      { questionId: "q1", selectedIndex: 0 },
      { questionId: "q2", selectedIndex: 1 },
      { questionId: "q3", selectedIndex: 0 },
    ];
    const result = scoreQuiz(answers, QUESTIONS);
    expect(result).toMatchObject({ total: 3, correct: 0, pct: 0 });
    expect(result.results.every((r) => !r.correct)).toBe(true);
  });

  it("arredonda a porcentagem parcial (1/3 -> 33%)", () => {
    const answers = [
      { questionId: "q1", selectedIndex: 1 }, // certo
      { questionId: "q2", selectedIndex: 1 }, // errado
      { questionId: "q3", selectedIndex: 0 }, // errado
    ];
    const result = scoreQuiz(answers, QUESTIONS);
    expect(result.correct).toBe(1);
    expect(result.pct).toBe(33);
  });

  it("cada resultado individual marca o índice certo esperado", () => {
    const answers = [{ questionId: "q1", selectedIndex: 0 }];
    const result = scoreQuiz(answers, QUESTIONS);
    expect(result.results[0]).toEqual({ questionId: "q1", selectedIndex: 0, correctIndex: 1, correct: false });
  });
});

describe("validateQuizAnswers", () => {
  const validRaw = [
    { questionId: "q1", selectedIndex: 1 },
    { questionId: "q2", selectedIndex: 0 },
    { questionId: "q3", selectedIndex: 3 },
  ];

  it("aceita um conjunto completo e válido", () => {
    expect(validateQuizAnswers(validRaw, QUESTIONS)).toEqual(validRaw);
  });

  it("rejeita entrada que não é array", () => {
    expect(validateQuizAnswers({}, QUESTIONS)).toBeNull();
    expect(validateQuizAnswers(null, QUESTIONS)).toBeNull();
  });

  it("rejeita quantidade de respostas diferente do nº de perguntas", () => {
    expect(validateQuizAnswers(validRaw.slice(0, 2), QUESTIONS)).toBeNull();
    expect(validateQuizAnswers([...validRaw, { questionId: "q1", selectedIndex: 0 }], QUESTIONS)).toBeNull();
  });

  it("rejeita pergunta duplicada (e consequentemente pergunta faltante)", () => {
    const answers = [
      { questionId: "q1", selectedIndex: 1 },
      { questionId: "q1", selectedIndex: 0 },
      { questionId: "q3", selectedIndex: 3 },
    ];
    expect(validateQuizAnswers(answers, QUESTIONS)).toBeNull();
  });

  it("rejeita questionId que não existe no template", () => {
    const answers = [
      { questionId: "q1", selectedIndex: 1 },
      { questionId: "q2", selectedIndex: 0 },
      { questionId: "q-inexistente", selectedIndex: 0 },
    ];
    expect(validateQuizAnswers(answers, QUESTIONS)).toBeNull();
  });

  it("rejeita índice fora do intervalo de opções da pergunta", () => {
    const answers = [
      { questionId: "q1", selectedIndex: 1 },
      { questionId: "q2", selectedIndex: 5 }, // q2 só tem 2 opções (0-1)
      { questionId: "q3", selectedIndex: 3 },
    ];
    expect(validateQuizAnswers(answers, QUESTIONS)).toBeNull();
  });

  it("rejeita item malformado (campo de tipo errado)", () => {
    const answers = [
      { questionId: "q1", selectedIndex: "1" },
      { questionId: "q2", selectedIndex: 0 },
      { questionId: "q3", selectedIndex: 3 },
    ];
    expect(validateQuizAnswers(answers, QUESTIONS)).toBeNull();
  });
});
