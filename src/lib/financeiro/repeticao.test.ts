import { describe, expect, it } from "vitest";
import {
  ajustarDia,
  frequenciaComDiaDoMes,
  horizonteDaSerie,
  ocorrenciasDaRepeticao,
  rotuloDaSerie,
  temProximasNaSerie,
  totalDaSerie,
  validarRepeticao,
  vencimentoNaPosicao,
} from "./repeticao";

// O que se testa (19/10, lote D): a série nasce com as datas e as
// competências certas — fim de mês, fim de semana, feriado e virada de ano.
describe("validarRepeticao", () => {
  it("sem frequência não repete; com ela, pede duas ou mais vezes", () => {
    expect(validarRepeticao({ frequencia: "", vezes: "", ajuste: "" })).toEqual({ ok: true, repeticao: null });
    expect(validarRepeticao({ frequencia: "MENSAL", vezes: "12", ajuste: "" })).toEqual({
      ok: true,
      repeticao: { frequencia: "MENSAL", ajuste: "ADIAR", fim: { tipo: "VEZES", vezes: 12 } },
    });
    expect(validarRepeticao({ frequencia: "MENSAL", vezes: "1", ajuste: "" })).toMatchObject({ ok: false });
    expect(validarRepeticao({ frequencia: "MENSAL", vezes: "2,5", ajuste: "" })).toMatchObject({ ok: false });
    expect(validarRepeticao({ frequencia: "MENSAL", vezes: "121", ajuste: "" })).toMatchObject({ ok: false });
    expect(validarRepeticao({ frequencia: "QUINZE", vezes: "3", ajuste: "" })).toMatchObject({ ok: false });
    expect(validarRepeticao({ frequencia: "SEMANAL", vezes: "3", ajuste: "OUTRO" })).toMatchObject({ ok: false });
  });

  // 21/10: o fim da série — até uma data, sem fim — e o todo dia útil.
  it("até uma data pede a data; sem fim não pede nada; o fim estranho é recusado", () => {
    expect(validarRepeticao({ frequencia: "MENSAL", fim: "ATE", vezes: "", ate: "2027-06-10", ajuste: "" })).toEqual({
      ok: true,
      repeticao: { frequencia: "MENSAL", ajuste: "ADIAR", fim: { tipo: "ATE", dataKey: "2027-06-10" } },
    });
    expect(validarRepeticao({ frequencia: "MENSAL", fim: "ATE", vezes: "", ate: "", ajuste: "" })).toMatchObject({ ok: false });
    expect(validarRepeticao({ frequencia: "DIARIA", fim: "SEM_FIM", vezes: "", ajuste: "" })).toEqual({
      ok: true,
      repeticao: { frequencia: "DIARIA", ajuste: "ADIAR", fim: { tipo: "SEM_FIM" } },
    });
    expect(validarRepeticao({ frequencia: "MENSAL", fim: "SEMPRE", vezes: "", ajuste: "" })).toMatchObject({ ok: false });
  });
});

describe("totalDaSerie", () => {
  const primeira = { vencimentoKey: "2026-11-10", competencia: "2026-11" };
  it("o número de vezes, as que cabem até a data, ou nulo sem fim", () => {
    expect(totalDaSerie(primeira, { frequencia: "MENSAL", ajuste: "ADIAR", fim: { tipo: "VEZES", vezes: 6 } })).toEqual({ ok: true, total: 6 });
    // De 10/11/2026 a 10/06/2027: novembro a junho, oito contas.
    expect(totalDaSerie(primeira, { frequencia: "MENSAL", ajuste: "ADIAR", fim: { tipo: "ATE", dataKey: "2027-06-10" } })).toEqual({ ok: true, total: 8 });
    expect(totalDaSerie(primeira, { frequencia: "MENSAL", ajuste: "ADIAR", fim: { tipo: "SEM_FIM" } })).toEqual({ ok: true, total: null });
  });
  it("recusa a data antes do vencimento, a que não repete e a que passa do teto", () => {
    expect(totalDaSerie(primeira, { frequencia: "MENSAL", ajuste: "ADIAR", fim: { tipo: "ATE", dataKey: "2026-11-01" } })).toMatchObject({ ok: false });
    expect(totalDaSerie(primeira, { frequencia: "MENSAL", ajuste: "ADIAR", fim: { tipo: "ATE", dataKey: "2026-11-20" } })).toMatchObject({ ok: false });
    expect(totalDaSerie(primeira, { frequencia: "DIARIA", ajuste: "ADIAR", fim: { tipo: "ATE", dataKey: "2031-01-01" } })).toMatchObject({ ok: false });
  });
});

describe("ajustarDia", () => {
  it("sábado e domingo vão para segunda ou voltam para sexta; dia útil fica", () => {
    expect(ajustarDia("2026-10-31", "ADIAR", new Set())).toBe("2026-11-02");
    expect(ajustarDia("2026-11-01", "ANTECIPAR", new Set())).toBe("2026-10-30");
    expect(ajustarDia("2026-10-31", "MANTER", new Set())).toBe("2026-10-31");
    expect(ajustarDia("2026-10-29", "ADIAR", new Set())).toBe("2026-10-29");
  });

  it("feriado emendado no fim de semana pula tudo", () => {
    // Sexta 20/11 (Consciência Negra), fim de semana: segunda 23.
    expect(ajustarDia("2026-11-20", "ADIAR", new Set(["2026-11-20"]))).toBe("2026-11-23");
    expect(ajustarDia("2026-11-22", "ANTECIPAR", new Set(["2026-11-20"]))).toBe("2026-11-19");
  });
});

describe("ocorrenciasDaRepeticao", () => {
  const datas = (o: { vencimentoKey: string; competencia: string }[]) => o.map((x) => `${x.vencimentoKey} ${x.competencia}`);

  it("mensal no dia 31: último dia dos meses curtos, fim de semana adiado, competência pelo mês de antes do ajuste", () => {
    const o = ocorrenciasDaRepeticao({ vencimentoKey: "2026-08-31", competencia: "2026-08" }, { frequencia: "MENSAL", ajuste: "ADIAR", fim: { tipo: "VEZES", vezes: 4 } });
    expect(datas(o)).toEqual(["2026-08-31 2026-08", "2026-09-30 2026-09", "2026-11-02 2026-10", "2026-11-30 2026-11"]);
    expect(o.map((x) => x.indice)).toEqual([1, 2, 3, 4]);
  });

  it("a primeira fica como foi digitada, mesmo num sábado", () => {
    const o = ocorrenciasDaRepeticao({ vencimentoKey: "2026-10-31", competencia: "2026-10" }, { frequencia: "MENSAL", ajuste: "ADIAR", fim: { tipo: "VEZES", vezes: 2 } });
    expect(o[0]!.vencimentoKey).toBe("2026-10-31");
  });

  it("competência diferente do mês do vencimento anda junto (folha de outubro paga em novembro)", () => {
    const o = ocorrenciasDaRepeticao({ vencimentoKey: "2026-11-05", competencia: "2026-10" }, { frequencia: "MENSAL", ajuste: "MANTER", fim: { tipo: "VEZES", vezes: 3 } });
    expect(datas(o)).toEqual(["2026-11-05 2026-10", "2026-12-05 2026-11", "2027-01-05 2026-12"]);
  });

  it("semanal e quinzenal contam dias; anual guarda o 29/02 no 28 dos outros anos", () => {
    expect(datas(ocorrenciasDaRepeticao({ vencimentoKey: "2026-10-26", competencia: "2026-10" }, { frequencia: "SEMANAL", ajuste: "MANTER", fim: { tipo: "VEZES", vezes: 2 } }))).toEqual([
      "2026-10-26 2026-10",
      "2026-11-02 2026-11",
    ]);
    expect(datas(ocorrenciasDaRepeticao({ vencimentoKey: "2026-10-01", competencia: "2026-10" }, { frequencia: "QUINZENAL", ajuste: "MANTER", fim: { tipo: "VEZES", vezes: 3 } }))).toEqual([
      "2026-10-01 2026-10",
      "2026-10-16 2026-10",
      "2026-10-31 2026-10",
    ]);
    expect(datas(ocorrenciasDaRepeticao({ vencimentoKey: "2028-02-29", competencia: "2028-02" }, { frequencia: "ANUAL", ajuste: "MANTER", fim: { tipo: "VEZES", vezes: 2 } }))).toEqual([
      "2028-02-29 2028-02",
      "2029-02-28 2029-02",
    ]);
  });

  it("feriado do escritório também ajusta", () => {
    const o = ocorrenciasDaRepeticao({ vencimentoKey: "2026-10-12", competencia: "2026-10" }, { frequencia: "MENSAL", ajuste: "ANTECIPAR", fim: { tipo: "VEZES", vezes: 2 } }, new Set(["2026-11-12"]));
    expect(o[1]!.vencimentoKey).toBe("2026-11-11");
  });
});

describe("rotuloDaSerie", () => {
  it("a posição na série, \"∞\" sem fim, e nada fora dela", () => {
    expect(rotuloDaSerie({ recurrenceIndex: 3, recurrenceTotal: 12 })).toBe("3/12");
    expect(rotuloDaSerie({ recurrenceIndex: 3, recurrenceTotal: null })).toBe("3/∞");
    expect(rotuloDaSerie({ recurrenceIndex: null, recurrenceTotal: null })).toBeNull();
  });
  it("tem próximas: antes da última, ou sempre na sem fim", () => {
    expect(temProximasNaSerie({ recurrenceId: "s", recurrenceIndex: 3, recurrenceTotal: 12 })).toBe(true);
    expect(temProximasNaSerie({ recurrenceId: "s", recurrenceIndex: 12, recurrenceTotal: 12 })).toBe(false);
    expect(temProximasNaSerie({ recurrenceId: "s", recurrenceIndex: 40, recurrenceTotal: null })).toBe(true);
    expect(temProximasNaSerie({ recurrenceId: null, recurrenceIndex: null, recurrenceTotal: null })).toBe(false);
  });
});

describe("a série sem número de vezes", () => {
  it("todo dia útil pula fim de semana e feriado, e a competência segue o mês", () => {
    // Quinta 29/10/2026, sexta 30, (sáb, dom) segunda 02/11 — com 02/11 (Finados) feriado, terça 03.
    const o = ocorrenciasDaRepeticao(
      { vencimentoKey: "2026-10-29", competencia: "2026-10" },
      { frequencia: "DIARIA", ajuste: "ADIAR", fim: { tipo: "VEZES", vezes: 3 } },
      new Set(["2026-11-02"])
    );
    expect(o.map((x) => [x.vencimentoKey, x.competencia])).toEqual([
      ["2026-10-29", "2026-10"],
      ["2026-10-30", "2026-10"],
      ["2026-11-03", "2026-11"],
    ]);
  });
  it("sem fim nasce até o horizonte; até a data, até a data ou o horizonte, o que vier antes", () => {
    const primeira = { vencimentoKey: "2026-10-21", competencia: "2026-10" };
    const horizonte = horizonteDaSerie("MENSAL", "2026-10-21");
    expect(horizonte).toBe("2027-10-21");
    const semFim = ocorrenciasDaRepeticao(primeira, { frequencia: "MENSAL", ajuste: "MANTER", fim: { tipo: "SEM_FIM" } }, new Set(), horizonte);
    expect(semFim).toHaveLength(13);
    expect(semFim.at(-1)?.vencimentoKey).toBe("2027-10-21");
    const ate = ocorrenciasDaRepeticao(primeira, { frequencia: "MENSAL", ajuste: "MANTER", fim: { tipo: "ATE", dataKey: "2027-01-21" } }, new Set(), horizonte);
    expect(ate.map((x) => x.indice)).toEqual([1, 2, 3, 4]);
  });
  it("o horizonte de cada frequência", () => {
    expect(horizonteDaSerie("DIARIA", "2026-10-21")).toBe("2026-12-21");
    expect(horizonteDaSerie("SEMANAL", "2026-10-21")).toBe("2027-04-21");
    expect(horizonteDaSerie("ANUAL", "2026-10-31")).toBe("2029-10-31");
  });
});

// O dia que mudou no "mudar a série daqui em diante" (22/10/2026).
describe("o dia novo da série", () => {
  it("as próximas nascem no dia novo; a primeira, a competência e o fim continuam como eram", () => {
    const r = { frequencia: "MENSAL" as const, ajuste: "MANTER" as const, fim: { tipo: "ATE" as const, dataKey: "2027-01-12" }, dia: 31 };
    const o = ocorrenciasDaRepeticao({ vencimentoKey: "2026-10-10", competencia: "2026-10" }, r);
    // O "até 12/01" conta pelo dia 10 de sempre: a de janeiro entra, no dia 31.
    expect(o.map((x) => x.vencimentoKey)).toEqual(["2026-10-10", "2026-11-30", "2026-12-31", "2027-01-31"]);
    expect(o.map((x) => x.competencia)).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"]);
  });

  it("na semanal o dia do mês não vale", () => {
    const r = { frequencia: "SEMANAL" as const, ajuste: "MANTER" as const, fim: { tipo: "VEZES" as const, vezes: 2 }, dia: 31 };
    expect(ocorrenciasDaRepeticao({ vencimentoKey: "2026-10-10", competencia: "2026-10" }, r).map((x) => x.vencimentoKey)).toEqual([
      "2026-10-10",
      "2026-10-17",
    ]);
    expect(frequenciaComDiaDoMes("SEMANAL")).toBe(false);
    expect(frequenciaComDiaDoMes("ANUAL")).toBe(true);
  });

  it("vencimentoNaPosicao: o mês da regra, o dia novo, ajustado — a primeira também", () => {
    // 15/11/2026 é domingo.
    expect(vencimentoNaPosicao("2026-10-10", "MENSAL", "ADIAR", 2, 15)).toBe("2026-11-16");
    expect(vencimentoNaPosicao("2026-10-10", "MENSAL", "MANTER", 5, 31)).toBe("2027-02-28");
    expect(vencimentoNaPosicao("2026-10-10", "MENSAL", "MANTER", 1, 20)).toBe("2026-10-20");
    expect(vencimentoNaPosicao("2026-10-10", "ANUAL", "MANTER", 3, 5)).toBe("2028-10-05");
  });
});
