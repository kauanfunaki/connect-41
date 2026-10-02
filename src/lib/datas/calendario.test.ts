import { describe, expect, it } from "vitest";
import {
  atalhosDePeriodo,
  dataBR,
  dataParaLeitura,
  dataPorExtenso,
  diaDaSemana,
  foraDoLimite,
  gradeDoMes,
  hojeIso,
  lerDataDigitada,
  lerHoraDigitada,
  lerIso,
  lerMesDigitado,
  mascararData,
  mascararHora,
  mascararMes,
  mesPorExtenso,
  periodoPorExtenso,
  somarDias,
  somarMeses,
  somarMesesNaData,
} from "./calendario";

describe("digitação de data", () => {
  it.each([
    ["06/10/2026", "2026-10-06"],
    ["6/10/2026", "2026-10-06"],
    ["06102026", "2026-10-06"],
    ["06/10/26", "2026-10-06"],
    ["061026", "2026-10-06"],
    ["06.10.2026", "2026-10-06"],
    ["2026-10-06", "2026-10-06"],
    ["  06/10/2026 ", "2026-10-06"],
    ["29/02/2028", "2028-02-29"],
  ])("%s → %s", (digitado, esperado) => {
    expect(lerDataDigitada(digitado, 2026)).toBe(esperado);
  });

  it.each(["", "31/02/2026", "29/02/2027", "32/01/2026", "00/10/2026", "06/13/2026", "0610", "abc", "06/10/202"])(
    "recusa %j",
    (digitado) => {
      expect(lerDataDigitada(digitado, 2026)).toBeNull();
    }
  );

  it("ano de dois dígitos: até dez anos à frente é deste século, o resto é nascimento", () => {
    expect(lerDataDigitada("15/03/36", 2026)).toBe("2036-03-15");
    expect(lerDataDigitada("15/03/85", 2026)).toBe("1985-03-15");
  });

  it.each([
    ["0", "0"],
    ["06", "06"],
    ["061", "06/1"],
    ["0610", "06/10"],
    ["06102", "06/10/2"],
    ["06102026", "06/10/2026"],
    ["061020269", "06/10/2026"],
    ["6/", "06/"],
    ["06/", "06/"],
    ["06/1/", "06/01/"],
    ["06/10/", "06/10/"],
    ["06/10/2026", "06/10/2026"],
    ["0a6b1c0", "06/10"],
  ])("máscara %j → %j", (digitado, esperado) => {
    expect(mascararData(digitado)).toBe(esperado);
  });

  it("Backspace sobre a barra não prende: '06/' menos um caractere vira '06'", () => {
    expect(mascararData("06")).toBe("06");
    expect(mascararData("06/1")).toBe("06/1");
  });
});

describe("mês e hora", () => {
  it.each([
    ["10/2026", "2026-10"],
    ["1/2026", "2026-01"],
    ["102026", "2026-10"],
    ["10/26", "2026-10"],
    ["2026-10", "2026-10"],
  ])("mês %s → %s", (digitado, esperado) => {
    expect(lerMesDigitado(digitado, 2026)).toBe(esperado);
  });

  it("recusa mês 13 e 00", () => {
    expect(lerMesDigitado("13/2026", 2026)).toBeNull();
    expect(lerMesDigitado("00/2026", 2026)).toBeNull();
  });

  it("máscara de mês", () => {
    expect(mascararMes("102026")).toBe("10/2026");
    expect(mascararMes("1/")).toBe("01/");
  });

  it.each([
    ["09:30", "09:30"],
    ["9:30", "09:30"],
    ["0930", "09:30"],
    ["930", "09:30"],
    ["9", "09:00"],
    ["14h", "14:00"],
    ["23:59", "23:59"],
  ])("hora %s → %s", (digitado, esperado) => {
    expect(lerHoraDigitada(digitado)).toBe(esperado);
  });

  it("recusa hora impossível", () => {
    expect(lerHoraDigitada("24:00")).toBeNull();
    expect(lerHoraDigitada("12:60")).toBeNull();
    expect(lerHoraDigitada("abc")).toBeNull();
  });

  it("máscara de hora", () => {
    expect(mascararHora("0930")).toBe("09:30");
    expect(mascararHora("9:")).toBe("09:");
    expect(mascararHora("093")).toBe("09:3");
  });
});

describe("texto na tela", () => {
  it("por extenso", () => {
    expect(dataPorExtenso("2026-10-06")).toBe("06 out 2026");
    expect(dataBR("2026-10-06")).toBe("06/10/2026");
    expect(mesPorExtenso("2026-10")).toBe("out 2026");
    expect(dataParaLeitura("2026-10-06")).toBe("terça-feira, 6 de outubro de 2026");
    expect(dataPorExtenso("")).toBe("");
  });

  it.each([
    ["2026-10-06", "2026-10-10", "06 – 10 out 2026"],
    ["2026-09-28", "2026-10-03", "28 set – 03 out 2026"],
    ["2025-12-28", "2026-01-03", "28 dez 2025 – 03 jan 2026"],
    ["2026-10-06", "2026-10-06", "06 out 2026"],
    ["2026-10-06", "", "a partir de 06 out 2026"],
    ["", "2026-10-10", "até 10 out 2026"],
    ["", "", ""],
  ])("período %s a %s", (de, ate, esperado) => {
    expect(periodoPorExtenso(de, ate)).toBe(esperado);
  });
});

describe("conta de calendário", () => {
  it("semana começa na segunda", () => {
    expect(diaDaSemana("2026-10-05")).toBe(0); // segunda
    expect(diaDaSemana("2026-10-11")).toBe(6); // domingo
  });

  it("grade de seis semanas, segunda a domingo, com o mês inteiro dentro", () => {
    const grade = gradeDoMes(2026, 10);
    expect(grade).toHaveLength(6);
    expect(grade.every((s) => s.length === 7)).toBe(true);
    expect(grade[0][0]).toBe("2026-09-28");
    const dias = grade.flat();
    for (let d = 1; d <= 31; d++) expect(dias).toContain(`2026-10-${String(d).padStart(2, "0")}`);
    expect(new Set(dias).size).toBe(42);
  });

  it("virada de mês e de ano", () => {
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2027-01-01", -1)).toBe("2026-12-31");
    expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(somarMeses(2026, 12, 1)).toEqual({ ano: 2027, mes: 1 });
    expect(somarMeses(2026, 1, -1)).toEqual({ ano: 2025, mes: 12 });
    expect(somarMesesNaData("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("nenhuma data anda um dia: somar 1 percorre 1990–2040 sem pular nem repetir", () => {
    let atual = "1990-01-01";
    let dias = 0;
    while (atual !== "2041-01-01") {
      const proximo = somarDias(atual, 1);
      expect(lerIso(proximo)).not.toBeNull();
      expect(proximo > atual).toBe(true);
      expect(somarDias(proximo, -1)).toBe(atual);
      atual = proximo;
      dias++;
    }
    // 51 anos, 13 deles bissextos (1992 … 2040).
    expect(dias).toBe(51 * 365 + 13);
  });

  it("hoje é o dia de São Paulo, não o do relógio UTC", () => {
    // 07/10 às 02h30 em UTC ainda é 06/10 às 23h30 em São Paulo.
    expect(hojeIso(new Date("2026-10-07T02:30:00Z"))).toBe("2026-10-06");
    expect(hojeIso(new Date("2026-10-07T03:30:00Z"))).toBe("2026-10-07");
  });

  it("limites", () => {
    expect(foraDoLimite("2026-10-06", "2026-10-07")).toBe(true);
    expect(foraDoLimite("2026-10-06", undefined, "2026-10-05")).toBe(true);
    expect(foraDoLimite("2026-10-06", "2026-10-06", "2026-10-06")).toBe(false);
  });

  it("atalhos de período", () => {
    const porRotulo = Object.fromEntries(atalhosDePeriodo("2026-10-06").map((a) => [a.rotulo, [a.de, a.ate]]));
    expect(porRotulo["Últimos 7 dias"]).toEqual(["2026-09-30", "2026-10-06"]);
    expect(porRotulo["Este mês"]).toEqual(["2026-10-01", "2026-10-31"]);
    expect(porRotulo["Mês passado"]).toEqual(["2026-09-01", "2026-09-30"]);
  });
});
