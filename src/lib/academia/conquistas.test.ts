import { describe, expect, it } from "vitest";
import { CONQUISTAS, conquistasDe, type FatosDasConquistas } from "./conquistas";

const nada: FatosDasConquistas = {
  temResultado: false, desafiosFeitos: 0, maiorSequencia: 0, maiorPpm: null, logicaPerfeita: false,
  maiorAcertoNosAtalhos: null, podios: 0, primeirosLugares: 0, maioresEvolucoes: 0,
};

describe("conquistas", () => {
  it("códigos únicos", () => {
    const codigos = CONQUISTAS.map((c) => c.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("sem nada feito, nenhuma", () => {
    expect(conquistasDe(nada).filter((c) => c.tem)).toEqual([]);
  });

  it("os marcos de PPM e de sequência", () => {
    const tem = conquistasDe({ ...nada, temResultado: true, maiorPpm: 62, desafiosFeitos: 9, maiorSequencia: 7 }).filter((c) => c.tem).map((c) => c.codigo);
    expect(tem).toEqual(["primeiro-teste", "primeiro-desafio", "sequencia-7", "ppm-40", "ppm-60"]);
  });

  it("as que a pessoa tem vêm primeiro", () => {
    const lista = conquistasDe({ ...nada, podios: 1, primeirosLugares: 1 });
    expect(lista.slice(0, 2).map((c) => c.codigo)).toEqual(["podio", "primeiro-lugar"]);
    expect(lista).toHaveLength(CONQUISTAS.length);
  });
});
