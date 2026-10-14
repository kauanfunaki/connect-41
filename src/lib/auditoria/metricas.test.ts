import { describe, expect, it } from "vitest";
import { contagemPorTipo, metricasDaAuditoria, opcoesDeArea, pessoasQueAgiram, quandoCurto } from "./metricas";

const AGORA = new Date("2026-10-14T17:40:00.000Z"); // 14:40 de quarta em São Paulo

const POR_ACAO = [
  { acao: "fiscal.document.edit", total: 10 },
  { acao: "fiscal.document.delete", total: 2 },
  { acao: "drive.file_upload", total: 5 },
  { acao: "person.delete", total: 1 },
  { acao: "clientDocument.send", total: 3 },
];

describe("contagens dos filtros", () => {
  it("por tipo: o que não é criar/editar/excluir só conta em Tudo", () => {
    expect(contagemPorTipo(POR_ACAO)).toEqual({ tudo: 21, criou: 5, editou: 10, excluiu: 3, outro: 3 });
  });

  it("por área, da que tem mais para a que tem menos", () => {
    expect(opcoesDeArea(POR_ACAO).map((a) => [a.chave, a.total])).toEqual([
      ["fiscal", 12],
      ["arquivos", 5],
      ["portal", 3],
      ["cadastros", 1],
    ]);
  });
});

describe("números do topo", () => {
  it("ações, pessoas, exclusões com a última e hoje", () => {
    expect(
      metricasDaAuditoria({ porAcao: POR_ACAO, pessoas: 4, ultimaExclusao: new Date("2026-10-13T12:15:00.000Z"), hoje: 7, agora: AGORA })
    ).toEqual({ acoes: 21, pessoas: 4, exclusoes: 3, ultimaExclusao: "a última ontem, 09:15", hoje: 7 });
  });

  it("sem exclusão, sem 'a última'", () => {
    expect(metricasDaAuditoria({ porAcao: [{ acao: "company.update", total: 1 }], pessoas: 1, ultimaExclusao: null, hoje: 0, agora: AGORA })).toMatchObject({
      exclusoes: 0,
      ultimaExclusao: null,
    });
  });

  it("quando, em poucas palavras", () => {
    expect(quandoCurto(new Date("2026-10-14T17:32:00.000Z"), AGORA)).toBe("hoje, 14:32");
    expect(quandoCurto(new Date("2026-10-06T20:20:00.000Z"), AGORA)).toBe("06/10, 17:20");
    expect(quandoCurto(new Date("2025-03-01T12:00:00.000Z"), AGORA)).toBe("01/03/2025");
  });
});

describe("pessoas que agiram", () => {
  it("uma linha por pessoa, com o nome atual; excluída entra pelo nome guardado", () => {
    const opcoes = pessoasQueAgiram(
      [
        { userId: "u1", nome: "Carla", total: 3 },
        { userId: "u1", nome: "Carla Mendes", total: 2 },
        { userId: null, nome: "Rafael Souza", total: 1 },
        { userId: null, nome: null, total: 4 },
      ],
      new Map([["u1", "Carla Mendes"]])
    );
    expect(opcoes).toEqual([
      { valor: "u1", rotulo: "Carla Mendes", total: 5, excluido: false },
      { valor: "nome:Rafael Souza", rotulo: "Rafael Souza", total: 1, excluido: true },
    ]);
  });
});
