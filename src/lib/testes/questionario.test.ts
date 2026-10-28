import { describe, expect, it } from "vitest";
import { scoreQuiz } from "@/lib/quiz";
import { alternativaPorLetra, contarPerguntas, filtrarPerguntas, perguntasRespondidas, type PerguntaDoModelo } from "./questionario";

const MODELO: PerguntaDoModelo[] = [
  // Fora de ordem de propósito: a lista segue `order`, não a ordem do banco.
  { id: "q2", order: 1, text: "Qual palavra está escrita certo?", options: ["Excessão", "Exceção", "Esceção"] },
  { id: "q1", order: 0, text: "Quanto é 15% de 200?", options: ["20", "30", "35"] },
  { id: "q3", order: 2, text: "O turno começa às 4h e dura 8h20. A que horas termina?", options: ["12h00", "12h20"] },
];
const CERTAS = [
  { id: "q1", correctIndex: 1 },
  { id: "q2", correctIndex: 1 },
  { id: "q3", correctIndex: 1 },
];

// Larissa acertou a 1 e errou a 2 e a 3 — respostas na ordem em que o formulário mandou.
const SCORES = scoreQuiz(
  [
    { questionId: "q3", selectedIndex: 0 },
    { questionId: "q1", selectedIndex: 1 },
    { questionId: "q2", selectedIndex: 0 },
  ],
  CERTAS
);

describe("perguntasRespondidas", () => {
  it("na ordem do modelo, com a resposta dada e a certa em texto", () => {
    expect(perguntasRespondidas(SCORES, MODELO)).toEqual([
      { numero: 1, texto: "Quanto é 15% de 200?", resposta: "30", certa: "30", acertou: true },
      { numero: 2, texto: "Qual palavra está escrita certo?", resposta: "Excessão", certa: "Exceção", acertou: false },
      { numero: 3, texto: "O turno começa às 4h e dura 8h20. A que horas termina?", resposta: "12h00", certa: "12h20", acertou: false },
    ]);
  });

  it("pergunta que saiu do modelo (modelo editado depois) aparece sem texto, com a letra da alternativa", () => {
    const lista = perguntasRespondidas(SCORES, MODELO.filter((q) => q.id !== "q3"));
    expect(lista).toHaveLength(3);
    expect(lista[2]).toEqual({ numero: 3, texto: null, resposta: "Alternativa A", certa: "Alternativa B", acertou: false });
  });

  it("resposta gravada com o texto (28/10) mantém a pergunta como o candidato viu, mesmo com o modelo editado", () => {
    const comTexto = scoreQuiz(
      [{ questionId: "q3", selectedIndex: 0 }],
      [{ id: "q3", correctIndex: 1, text: MODELO[2].text, options: MODELO[2].options }]
    );
    // O modelo foi editado: a q3 sumiu, e a q1 ganhou outro texto.
    const editado = [{ ...MODELO[1], text: "Pergunta reescrita" }];
    expect(perguntasRespondidas(comTexto, editado)).toEqual([
      { numero: 1, texto: "O turno começa às 4h e dura 8h20. A que horas termina?", resposta: "12h00", certa: "12h20", acertou: false },
    ]);
  });

  it("resultado sem a lista (dado antigo ou estragado) vira lista vazia", () => {
    expect(perguntasRespondidas(null, MODELO)).toEqual([]);
    expect(perguntasRespondidas({ total: 3, correct: 1, pct: 33 } as never, MODELO)).toEqual([]);
  });

  it("alternativa sem texto cai na letra", () => {
    const modelo = [{ id: "q1", order: 0, text: "Pergunta", options: ["", "Sim"] }];
    const r = scoreQuiz([{ questionId: "q1", selectedIndex: 0 }], [{ id: "q1", correctIndex: 1 }]);
    expect(perguntasRespondidas(r, modelo)[0]).toMatchObject({ resposta: "Alternativa A", certa: "Sim" });
    expect(alternativaPorLetra(3)).toBe("Alternativa D");
  });
});

describe("o filtro Todas / Erradas", () => {
  const lista = perguntasRespondidas(SCORES, MODELO);

  it("conta para os rótulos", () => {
    expect(contarPerguntas(lista)).toEqual({ todas: 3, erradas: 2 });
  });

  it("Erradas mostra só as erradas, na mesma numeração", () => {
    expect(filtrarPerguntas(lista, "erradas").map((p) => p.numero)).toEqual([2, 3]);
    expect(filtrarPerguntas(lista, "todas")).toHaveLength(3);
  });

  it("tudo certo: Erradas fica vazio", () => {
    const tudoCerto = perguntasRespondidas(
      scoreQuiz(CERTAS.map((c) => ({ questionId: c.id, selectedIndex: c.correctIndex })), CERTAS),
      MODELO
    );
    expect(contarPerguntas(tudoCerto)).toEqual({ todas: 3, erradas: 0 });
    expect(filtrarPerguntas(tudoCerto, "erradas")).toEqual([]);
  });
});
