import { describe, expect, it } from "vitest";
import { ajustarDia, ocorrenciasDaRepeticao, rotuloDaSerie, validarRepeticao } from "./repeticao";

// O que se testa (19/10, lote D): a série nasce com as datas e as
// competências certas — fim de mês, fim de semana, feriado e virada de ano.
describe("validarRepeticao", () => {
  it("sem frequência não repete; com ela, pede duas ou mais vezes", () => {
    expect(validarRepeticao({ frequencia: "", vezes: "", ajuste: "" })).toEqual({ ok: true, repeticao: null });
    expect(validarRepeticao({ frequencia: "MENSAL", vezes: "12", ajuste: "" })).toEqual({
      ok: true,
      repeticao: { frequencia: "MENSAL", vezes: 12, ajuste: "ADIAR" },
    });
    expect(validarRepeticao({ frequencia: "MENSAL", vezes: "1", ajuste: "" })).toMatchObject({ ok: false });
    expect(validarRepeticao({ frequencia: "MENSAL", vezes: "2,5", ajuste: "" })).toMatchObject({ ok: false });
    expect(validarRepeticao({ frequencia: "MENSAL", vezes: "121", ajuste: "" })).toMatchObject({ ok: false });
    expect(validarRepeticao({ frequencia: "DIARIA", vezes: "3", ajuste: "" })).toMatchObject({ ok: false });
    expect(validarRepeticao({ frequencia: "SEMANAL", vezes: "3", ajuste: "OUTRO" })).toMatchObject({ ok: false });
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
    const o = ocorrenciasDaRepeticao({ vencimentoKey: "2026-08-31", competencia: "2026-08" }, { frequencia: "MENSAL", vezes: 4, ajuste: "ADIAR" });
    expect(datas(o)).toEqual(["2026-08-31 2026-08", "2026-09-30 2026-09", "2026-11-02 2026-10", "2026-11-30 2026-11"]);
    expect(o.map((x) => x.indice)).toEqual([1, 2, 3, 4]);
  });

  it("a primeira fica como foi digitada, mesmo num sábado", () => {
    const o = ocorrenciasDaRepeticao({ vencimentoKey: "2026-10-31", competencia: "2026-10" }, { frequencia: "MENSAL", vezes: 2, ajuste: "ADIAR" });
    expect(o[0]!.vencimentoKey).toBe("2026-10-31");
  });

  it("competência diferente do mês do vencimento anda junto (folha de outubro paga em novembro)", () => {
    const o = ocorrenciasDaRepeticao({ vencimentoKey: "2026-11-05", competencia: "2026-10" }, { frequencia: "MENSAL", vezes: 3, ajuste: "MANTER" });
    expect(datas(o)).toEqual(["2026-11-05 2026-10", "2026-12-05 2026-11", "2027-01-05 2026-12"]);
  });

  it("semanal e quinzenal contam dias; anual guarda o 29/02 no 28 dos outros anos", () => {
    expect(datas(ocorrenciasDaRepeticao({ vencimentoKey: "2026-10-26", competencia: "2026-10" }, { frequencia: "SEMANAL", vezes: 2, ajuste: "MANTER" }))).toEqual([
      "2026-10-26 2026-10",
      "2026-11-02 2026-11",
    ]);
    expect(datas(ocorrenciasDaRepeticao({ vencimentoKey: "2026-10-01", competencia: "2026-10" }, { frequencia: "QUINZENAL", vezes: 3, ajuste: "MANTER" }))).toEqual([
      "2026-10-01 2026-10",
      "2026-10-16 2026-10",
      "2026-10-31 2026-10",
    ]);
    expect(datas(ocorrenciasDaRepeticao({ vencimentoKey: "2028-02-29", competencia: "2028-02" }, { frequencia: "ANUAL", vezes: 2, ajuste: "MANTER" }))).toEqual([
      "2028-02-29 2028-02",
      "2029-02-28 2029-02",
    ]);
  });

  it("feriado do escritório também ajusta", () => {
    const o = ocorrenciasDaRepeticao({ vencimentoKey: "2026-10-12", competencia: "2026-10" }, { frequencia: "MENSAL", vezes: 2, ajuste: "ANTECIPAR" }, new Set(["2026-11-12"]));
    expect(o[1]!.vencimentoKey).toBe("2026-11-11");
  });
});

describe("rotuloDaSerie", () => {
  it("a posição na série, e nada fora dela", () => {
    expect(rotuloDaSerie({ recurrenceIndex: 3, recurrenceTotal: 12 })).toBe("3/12");
    expect(rotuloDaSerie({ recurrenceIndex: null, recurrenceTotal: null })).toBeNull();
  });
});
