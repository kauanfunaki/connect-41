import { describe, expect, it } from "vitest";
import { feriadosNacionais } from "@/lib/datas/feriadosNacionais";
import {
  ajustarAoDiaUtil,
  competenciaQueContem,
  competenciaValida,
  datasDaCompetencia,
  descreverRegraDeData,
  ehDiaUtil,
  proximasOcorrencias,
  rotuloDaCompetencia,
  somarCompetencias,
  ultimoDiaUtilDoMes,
  voltarDiasUteis,
  type RegraDeData,
} from "./calendario";

const NACIONAIS = new Set([2025, 2026, 2027, 2028].flatMap((a) => feriadosNacionais(a).map((f) => f.data)));
const comExcecao = (...datas: string[]) => new Set([...NACIONAIS, ...datas]);

const DAS: RegraDeData = { periodicidade: "MENSAL", mesesAposCompetencia: 1, diaLegal: 20, diasUteisAntes: 0, ajuste: "ADIAR" };

describe("dia útil", () => {
  it("fim de semana e feriado não são; dia comum é", () => {
    expect(ehDiaUtil("2026-10-22", NACIONAIS)).toBe(true);
    expect(ehDiaUtil("2026-10-31", NACIONAIS)).toBe(false); // sábado
    expect(ehDiaUtil("2026-11-02", NACIONAIS)).toBe(false); // Finados, segunda
    expect(ehDiaUtil("2026-11-20", NACIONAIS)).toBe(false); // Consciência Negra, sexta
  });

  it("adia e antecipa pulando feriado e fim de semana juntos", () => {
    // Sexta feriado + fim de semana: adia para segunda, antecipa para quinta.
    expect(ajustarAoDiaUtil("2026-11-20", "ADIAR", NACIONAIS)).toBe("2026-11-23");
    expect(ajustarAoDiaUtil("2026-11-20", "ANTECIPAR", NACIONAIS)).toBe("2026-11-19");
    // Sábado antes de Finados: adia até terça.
    expect(ajustarAoDiaUtil("2026-10-31", "ADIAR", NACIONAIS)).toBe("2026-11-03");
    // Dia útil fica como está.
    expect(ajustarAoDiaUtil("2026-10-22", "ANTECIPAR", NACIONAIS)).toBe("2026-10-22");
  });

  it("último dia útil do mês", () => {
    expect(ultimoDiaUtilDoMes(2026, 10, NACIONAIS)).toBe("2026-10-30"); // 31 é sábado
    expect(ultimoDiaUtilDoMes(2026, 12, NACIONAIS)).toBe("2026-12-31"); // quinta
    expect(ultimoDiaUtilDoMes(2027, 2, NACIONAIS)).toBe("2027-02-26"); // 28 é domingo
    // Bissexto: 29/02/2028 é terça, mas é a terça de Carnaval — fica a segunda.
    expect(ultimoDiaUtilDoMes(2028, 2, NACIONAIS)).toBe("2028-02-28");
    expect(ultimoDiaUtilDoMes(2028, 2, new Set())).toBe("2028-02-29");
  });

  it("volta N dias úteis, contando só os úteis", () => {
    expect(voltarDiasUteis("2026-11-23", 0, NACIONAIS)).toBe("2026-11-23");
    expect(voltarDiasUteis("2026-11-23", 1, NACIONAIS)).toBe("2026-11-19"); // pula fim de semana e o dia 20
    expect(voltarDiasUteis("2026-11-23", 2, NACIONAIS)).toBe("2026-11-18");
    expect(voltarDiasUteis("2026-11-04", 2, NACIONAIS)).toBe("2026-10-30"); // pula Finados e o fim de semana
  });
});

describe("competências", () => {
  it("valida por periodicidade", () => {
    expect(competenciaValida("MENSAL", "2026-08")).toBe(true);
    expect(competenciaValida("TRIMESTRAL", "2026-08")).toBe(false);
    expect(competenciaValida("TRIMESTRAL", "2026-09")).toBe(true);
    expect(competenciaValida("ANUAL", "2026-09")).toBe(false);
    expect(competenciaValida("ANUAL", "2026-12")).toBe(true);
    expect(competenciaValida("MENSAL", "2026-13")).toBe(false);
    expect(competenciaValida("MENSAL", "2026-1")).toBe(false);
  });

  it("acha a competência que contém um mês e soma competências", () => {
    expect(competenciaQueContem("MENSAL", 2026, 8)).toBe("2026-08");
    expect(competenciaQueContem("TRIMESTRAL", 2026, 8)).toBe("2026-09");
    expect(competenciaQueContem("TRIMESTRAL", 2026, 1)).toBe("2026-03");
    expect(competenciaQueContem("ANUAL", 2026, 1)).toBe("2026-12");
    expect(somarCompetencias("MENSAL", "2026-12", 1)).toBe("2027-01");
    expect(somarCompetencias("TRIMESTRAL", "2026-12", 1)).toBe("2027-03");
    expect(somarCompetencias("ANUAL", "2026-12", -1)).toBe("2025-12");
  });

  it("rótulos", () => {
    expect(rotuloDaCompetencia("MENSAL", "2026-09")).toBe("09/2026");
    expect(rotuloDaCompetencia("TRIMESTRAL", "2026-09")).toBe("3º trimestre de 2026");
    expect(rotuloDaCompetencia("ANUAL", "2026-12")).toBe("2026");
  });
});

describe("datas da competência", () => {
  it("DAS de outubro: dia 20/11 é feriado numa sexta — adia para segunda", () => {
    expect(datasDaCompetencia(DAS, "2026-10", NACIONAIS)).toEqual({
      competencia: "2026-10",
      dataBase: "2026-11-20",
      dataLegal: "2026-11-23",
      prazoInterno: "2026-11-23",
    });
  });

  it("antecipar vs adiar no domingo", () => {
    expect(datasDaCompetencia(DAS, "2026-11", NACIONAIS)?.dataLegal).toBe("2026-12-21");
    expect(datasDaCompetencia({ ...DAS, ajuste: "ANTECIPAR" }, "2026-11", NACIONAIS)?.dataLegal).toBe("2026-12-18");
  });

  it("antecipar pode voltar para o mês anterior", () => {
    const dia1 = { ...DAS, diaLegal: 1, ajuste: "ANTECIPAR" as const };
    expect(datasDaCompetencia(dia1, "2026-10", NACIONAIS)?.dataLegal).toBe("2026-10-30"); // 01/11 é domingo
  });

  it("dia 31 em fevereiro vira o último dia do mês, e então ajusta", () => {
    const dia31 = { ...DAS, diaLegal: 31 };
    expect(datasDaCompetencia(dia31, "2027-01", NACIONAIS)).toMatchObject({ dataBase: "2027-02-28", dataLegal: "2027-03-01" });
    expect(datasDaCompetencia({ ...dia31, ajuste: "ANTECIPAR" }, "2027-01", NACIONAIS)?.dataLegal).toBe("2027-02-26");
    // Bissexto: dia 30 vira 29/02/2028, que é Carnaval — adia para 01/03.
    expect(datasDaCompetencia({ ...DAS, diaLegal: 30 }, "2028-01", NACIONAIS)).toMatchObject({ dataBase: "2028-02-29", dataLegal: "2028-03-01" });
    expect(datasDaCompetencia({ ...DAS, diaLegal: 31 }, "2026-03", NACIONAIS)?.dataBase).toBe("2026-04-30");
  });

  it("feriado do escritório conta como os nacionais", () => {
    expect(datasDaCompetencia(DAS, "2026-10", comExcecao("2026-11-23"))?.dataLegal).toBe("2026-11-24");
  });

  it("prazo interno em dias úteis antes da data legal", () => {
    expect(datasDaCompetencia({ ...DAS, diasUteisAntes: 2 }, "2026-10", NACIONAIS)?.prazoInterno).toBe("2026-11-18");
    expect(datasDaCompetencia({ ...DAS, diasUteisAntes: 1 }, "2026-11", NACIONAIS)?.prazoInterno).toBe("2026-12-18");
  });

  it("último dia útil não usa o ajuste", () => {
    const ultimo = { ...DAS, diaLegal: null, ajuste: "ADIAR" as const };
    expect(datasDaCompetencia(ultimo, "2026-09", NACIONAIS)).toMatchObject({ dataBase: "2026-10-30", dataLegal: "2026-10-30" });
  });

  it("trimestral: IRPJ do 3º trimestre no último dia útil de outubro; competência fora do trimestre é nula", () => {
    const irpj: RegraDeData = { periodicidade: "TRIMESTRAL", mesesAposCompetencia: 1, diaLegal: null, diasUteisAntes: 0, ajuste: "ADIAR" };
    expect(datasDaCompetencia(irpj, "2026-09", NACIONAIS)?.dataLegal).toBe("2026-10-30");
    expect(datasDaCompetencia(irpj, "2026-08", NACIONAIS)).toBeNull();
  });

  it("anual: DEFIS em 31/03 e ECF no último dia útil de julho do ano seguinte", () => {
    const defis: RegraDeData = { periodicidade: "ANUAL", mesesAposCompetencia: 3, diaLegal: 31, diasUteisAntes: 0, ajuste: "ANTECIPAR" };
    const ecf: RegraDeData = { periodicidade: "ANUAL", mesesAposCompetencia: 7, diaLegal: null, diasUteisAntes: 0, ajuste: "ADIAR" };
    expect(datasDaCompetencia(defis, "2026-12", NACIONAIS)?.dataLegal).toBe("2027-03-31");
    expect(datasDaCompetencia(ecf, "2026-12", NACIONAIS)?.dataLegal).toBe("2027-07-30");
    expect(datasDaCompetencia(ecf, "2026-06", NACIONAIS)).toBeNull();
  });
});

describe("próximas ocorrências", () => {
  it("mensal: as três próximas cuja data legal não passou", () => {
    const lista = proximasOcorrencias(DAS, "2026-10-22", NACIONAIS);
    expect(lista.map((o) => [o.competencia, o.dataLegal])).toEqual([
      ["2026-10", "2026-11-23"],
      ["2026-11", "2026-12-21"],
      ["2026-12", "2027-01-20"],
    ]);
  });

  it("o vencimento de hoje ainda entra", () => {
    expect(proximasOcorrencias(DAS, "2026-10-20", NACIONAIS)[0]?.competencia).toBe("2026-09");
    expect(proximasOcorrencias(DAS, "2026-10-21", NACIONAIS)[0]?.competencia).toBe("2026-10");
  });

  it("antecipada para o mês anterior também é achada", () => {
    const dia1 = { ...DAS, diaLegal: 1, ajuste: "ANTECIPAR" as const };
    expect(proximasOcorrencias(dia1, "2026-10-29", NACIONAIS)[0]).toMatchObject({ competencia: "2026-10", dataLegal: "2026-10-30" });
  });

  it("trimestral e anual: só a próxima", () => {
    const irpj: RegraDeData = { periodicidade: "TRIMESTRAL", mesesAposCompetencia: 1, diaLegal: null, diasUteisAntes: 0, ajuste: "ADIAR" };
    expect(proximasOcorrencias(irpj, "2026-10-22", NACIONAIS).map((o) => o.competencia)).toEqual(["2026-09"]);
    expect(proximasOcorrencias(irpj, "2026-11-01", NACIONAIS).map((o) => [o.competencia, o.dataLegal])).toEqual([["2026-12", "2027-01-29"]]);
    const defis: RegraDeData = { periodicidade: "ANUAL", mesesAposCompetencia: 3, diaLegal: 31, diasUteisAntes: 0, ajuste: "ADIAR" };
    expect(proximasOcorrencias(defis, "2026-10-22", NACIONAIS).map((o) => [o.competencia, o.dataLegal])).toEqual([["2026-12", "2027-03-31"]]);
    expect(proximasOcorrencias(defis, "2026-03-15", NACIONAIS).map((o) => o.competencia)).toEqual(["2025-12"]);
  });

  it("vencimento no mesmo mês da competência (deslocamento 0)", () => {
    const mesmo = { ...DAS, mesesAposCompetencia: 0, diaLegal: 25 };
    expect(proximasOcorrencias(mesmo, "2026-10-22", NACIONAIS)[0]).toMatchObject({ competencia: "2026-10", dataLegal: "2026-10-26" });
  });
});

describe("descrição da regra", () => {
  it("em uma frase", () => {
    expect(descreverRegraDeData({ ...DAS, diasUteisAntes: 2 })).toBe("dia 20, no mês seguinte · adia se não for dia útil · prazo interno 2 dias úteis antes");
    expect(descreverRegraDeData({ periodicidade: "ANUAL", mesesAposCompetencia: 7, diaLegal: null, diasUteisAntes: 0, ajuste: "ADIAR" })).toBe(
      "último dia útil, 7 meses depois do fim do ano"
    );
  });
});
