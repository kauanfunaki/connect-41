import { describe, expect, it } from "vitest";
import { anosDosFeriados, domingoDePascoa, feriadosNacionais, juntarFeriados } from "./feriadosNacionais";

const datas = (ano: number) => feriadosNacionais(ano).map((f) => f.data);
const dataDe = (ano: number, nome: string) => feriadosNacionais(ano).find((f) => f.nome.startsWith(nome))?.data;

describe("domingoDePascoa", () => {
  it("bate com as datas conhecidas", () => {
    expect(domingoDePascoa(2024)).toBe("2024-03-31");
    expect(domingoDePascoa(2025)).toBe("2025-04-20");
    expect(domingoDePascoa(2026)).toBe("2026-04-05");
    expect(domingoDePascoa(2027)).toBe("2027-03-28");
    expect(domingoDePascoa(2038)).toBe("2038-04-25"); // a mais tarde possível
  });
});

describe("feriadosNacionais", () => {
  it("2025: os móveis a partir da Páscoa de 20/04", () => {
    expect(dataDe(2025, "Carnaval")).toBe("2025-03-04");
    expect(dataDe(2025, "Sexta-feira Santa")).toBe("2025-04-18");
    expect(dataDe(2025, "Corpus Christi")).toBe("2025-06-19");
  });

  it("2026: a lista inteira, em ordem", () => {
    expect(datas(2026)).toEqual([
      "2026-01-01",
      "2026-02-17",
      "2026-04-03",
      "2026-04-21",
      "2026-05-01",
      "2026-06-04",
      "2026-09-07",
      "2026-10-12",
      "2026-11-02",
      "2026-11-15",
      "2026-11-20",
      "2026-12-25",
    ]);
  });

  it("2027: os móveis a partir da Páscoa de 28/03", () => {
    expect(dataDe(2027, "Carnaval")).toBe("2027-02-09");
    expect(dataDe(2027, "Sexta-feira Santa")).toBe("2027-03-26");
    expect(dataDe(2027, "Corpus Christi")).toBe("2027-05-27");
  });

  it("Consciência Negra só a partir de 2024", () => {
    expect(datas(2023)).not.toContain("2023-11-20");
    expect(datas(2024)).toContain("2024-11-20");
  });

  it("Carnaval cai sempre numa terça, Sexta-feira Santa numa sexta, Corpus Christi numa quinta", () => {
    for (const ano of [2025, 2026, 2027, 2030]) {
      const dia = (nome: string) => new Date(`${dataDe(ano, nome)}T00:00:00Z`).getUTCDay();
      expect(dia("Carnaval")).toBe(2);
      expect(dia("Sexta-feira Santa")).toBe(5);
      expect(dia("Corpus Christi")).toBe(4);
    }
  });
});

describe("anosDosFeriados", () => {
  it("cobre o ano corrente e o seguinte", () => {
    expect(anosDosFeriados(2026)).toContain(2026);
    expect(anosDosFeriados(2026)).toContain(2027);
  });
});

describe("juntarFeriados", () => {
  it("nacional automático, exceção editável, sem repetir a data já importada", () => {
    const lista = juntarFeriados(feriadosNacionais(2026), [
      { id: "a", data: "2026-12-25", nome: "Natal" }, // gravado pela importação antiga
      { id: "b", data: "2026-12-08", nome: "Imaculada Conceição (municipal)" },
    ]);
    expect(lista.filter((f) => f.data === "2026-12-25")).toEqual([{ data: "2026-12-25", nome: "Natal", automatico: true }]);
    expect(lista.find((f) => f.data === "2026-12-08")).toEqual({
      id: "b",
      data: "2026-12-08",
      nome: "Imaculada Conceição (municipal)",
      automatico: false,
    });
    expect(lista.map((f) => f.data)).toEqual([...lista.map((f) => f.data)].sort());
  });
});
