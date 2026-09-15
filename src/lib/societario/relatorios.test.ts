import { describe, it, expect } from "vitest";
import {
  lerPeriodo,
  inicioDoPeriodo,
  slaPorTipo,
  resumoDeVoltas,
  processosComMaisVoltas,
  produtividadePorResponsavel,
  custoPorProcesso,
  totaisDeCusto,
  type ProcessoParaRelatorio,
} from "./relatorios";
import type { Prazo } from "./processo";

const prazo = (dias: number, situacao: Prazo["situacao"], max: number | null = 7): Prazo => ({
  dias,
  situacao,
  previstoMin: max === null ? null : 4,
  previstoMax: max,
});

function proc(over: Partial<ProcessoParaRelatorio> & { id: string }): ProcessoParaRelatorio {
  return {
    tipoId: "const",
    tipoNome: "Constituição",
    empresaNome: "Alfa",
    responsavelId: "ana",
    responsavelNome: "Ana",
    prazo: prazo(3, "dentro"),
    voltas: 0,
    concluidoEm: null,
    taxas: [],
    ...over,
  };
}

describe("período", () => {
  it("aceita só os períodos conhecidos e cai em 90 dias", () => {
    expect(lerPeriodo("30").dias).toBe(30);
    expect(lerPeriodo("365").dias).toBe(365);
    expect(lerPeriodo("7").dias).toBe(90);
    expect(lerPeriodo(undefined).dias).toBe(90);
  });

  it("o início é agora menos os dias do período", () => {
    const agora = new Date("2026-09-15T12:00:00Z");
    expect(inicioDoPeriodo(lerPeriodo("30"), agora).toISOString()).toBe("2026-08-16T12:00:00.000Z");
  });
});

describe("slaPorTipo", () => {
  it("conta cada situação de prazo por tipo, com média de dias e de voltas", () => {
    const linhas = slaPorTipo([
      proc({ id: "1", prazo: prazo(3, "dentro"), voltas: 0 }),
      proc({ id: "2", prazo: prazo(7, "no_limite"), voltas: 1, concluidoEm: new Date() }),
      proc({ id: "3", prazo: prazo(12, "estourado"), voltas: 2 }),
      proc({
        id: "4",
        tipoId: "alv",
        tipoNome: "Alvará",
        prazo: prazo(40, "sem_previsao", null),
      }),
    ]);

    // Ordem alfabética do nome do tipo.
    expect(linhas.map((l) => l.tipoNome)).toEqual(["Alvará", "Constituição"]);
    const c = linhas[1];
    expect(c).toMatchObject({
      total: 3,
      concluidos: 1,
      dentro: 1,
      noLimite: 1,
      estourados: 1,
      semPrevisao: 0,
      previstoMin: 4,
      previstoMax: 7,
      mediaDeDias: 7.3,
      mediaDeVoltas: 1,
    });
    expect(linhas[0]).toMatchObject({ semPrevisao: 1, previstoMax: null });
  });
});

describe("voltas", () => {
  it("resume quantos voltaram e quanto", () => {
    expect(
      resumoDeVoltas([proc({ id: "1", voltas: 2 }), proc({ id: "2" }), proc({ id: "3", voltas: 1 })])
    ).toEqual({ processos: 3, comVolta: 2, totalDeVoltas: 3, percentualComVolta: 67 });
  });

  it("sem processo, o percentual é nulo e não zero", () => {
    expect(resumoDeVoltas([]).percentualComVolta).toBeNull();
  });

  it("os que mais voltaram, desempatando pelo prazo consumido", () => {
    const top = processosComMaisVoltas(
      [
        proc({ id: "zero" }),
        proc({ id: "uma", voltas: 1 }),
        proc({ id: "duas-rapido", voltas: 2, prazo: prazo(5, "dentro") }),
        proc({ id: "duas-lento", voltas: 2, prazo: prazo(20, "estourado") }),
      ],
      2
    );
    expect(top.map((p) => p.id)).toEqual(["duas-lento", "duas-rapido"]);
  });
});

describe("produtividadePorResponsavel", () => {
  const inicio = new Date("2026-09-01T00:00:00Z");
  const fim = new Date("2026-09-30T23:59:59Z");

  it("conta concluídos no período e a carteira aberta, e ignora concluído fora do período", () => {
    const linhas = produtividadePorResponsavel(
      [
        proc({ id: "a1", concluidoEm: new Date("2026-09-10T12:00:00Z"), prazo: prazo(4, "dentro"), voltas: 1 }),
        proc({ id: "a2", concluidoEm: new Date("2026-09-12T12:00:00Z"), prazo: prazo(9, "estourado") }),
        proc({ id: "a3", prazo: prazo(10, "estourado") }),
        proc({ id: "b1", responsavelId: "bia", responsavelNome: "Bia" }),
        proc({ id: "velho", responsavelId: "caio", responsavelNome: "Caio", concluidoEm: new Date("2026-06-01T12:00:00Z") }),
        proc({ id: "solto", responsavelId: null, responsavelNome: null, concluidoEm: new Date("2026-09-05T12:00:00Z") }),
      ],
      inicio,
      fim
    );

    expect(linhas.map((l) => l.nome)).toEqual(["Ana", "Bia", "Sem responsável"]);
    expect(linhas[0]).toEqual({
      responsavelId: "ana",
      nome: "Ana",
      abertos: 1,
      estouradosAbertos: 1,
      concluidosNoPeriodo: 2,
      mediaDeDiasDosConcluidos: 6.5,
      voltasDosConcluidos: 1,
    });
    expect(linhas[1]).toMatchObject({ abertos: 1, concluidosNoPeriodo: 0, mediaDeDiasDosConcluidos: null });
  });
});

describe("custo em taxas", () => {
  it("só entra processo com taxa, do mais caro ao mais barato, com o custo das voltas separado", () => {
    const linhas = custoPorProcesso([
      proc({ id: "sem-taxa" }),
      proc({
        id: "barato",
        taxas: [{ amountCents: 5000, paidAt: new Date(), attempt: 1 }],
      }),
      proc({
        id: "caro",
        voltas: 1,
        taxas: [
          { amountCents: 10000, paidAt: new Date(), attempt: 1 },
          { amountCents: 10000, paidAt: null, attempt: 2 },
        ],
      }),
    ]);

    expect(linhas.map((l) => l.id)).toEqual(["caro", "barato"]);
    expect(linhas[0]).toMatchObject({ totalCentavos: 20000, pagoCentavos: 10000, custoDasVoltasCentavos: 10000 });
    expect(totaisDeCusto(linhas)).toEqual({
      totalCentavos: 25000,
      pagoCentavos: 15000,
      custoDasVoltasCentavos: 10000,
    });
  });
});
