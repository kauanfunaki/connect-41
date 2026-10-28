import { describe, expect, it } from "vitest";
import type { LinhaDaDominio } from "./planilha";
import { correcaoEntre, estadoDasLinhas, estorno, lerEstado } from "./correcao";

const linha = (baixaId: string, centavos: number, extra: Partial<LinhaDaDominio> = {}): LinhaDaDominio => ({
  dataKey: "2026-10-15",
  debito: "341",
  credito: "7",
  centavos,
  codigoHistorico: "",
  complemento: `PAGTO ${baixaId}`,
  codigoFilial: "1",
  baixaId,
  ...extra,
});

describe("estado do que foi para a Domínio", () => {
  it("agrupa por baixa, e linha sem baixa fica de fora", () => {
    const juros = linha("b1", 500, { debito: "400", complemento: "JUROS/MULTA PAGTO b1" });
    expect(estadoDasLinhas([linha("b1", 1000), juros, linha("b2", 200), { ...linha("x", 1), baixaId: undefined }])).toEqual({
      b1: [linha("b1", 1000), juros],
      b2: [linha("b2", 200)],
    });
  });

  it("lê o JSON gravado e descarta o que não é linha", () => {
    expect(lerEstado({ b1: [linha("b1", 1000), { lixo: true }], b2: "nada" })).toEqual({ b1: [linha("b1", 1000)] });
    expect(lerEstado(null)).toEqual({});
    expect(lerEstado([1, 2])).toEqual({});
  });
});

describe("a correção", () => {
  it("nada mudou: arquivo vazio", () => {
    const e = estadoDasLinhas([linha("b1", 1000), linha("b2", 200)]);
    expect(correcaoEntre(e, e)).toEqual({ linhas: [], novas: 0, alteradas: 0, removidas: 0 });
  });

  it("baixa nova entra inteira", () => {
    const r = correcaoEntre(estadoDasLinhas([linha("b1", 1000)]), estadoDasLinhas([linha("b1", 1000), linha("b2", 200)]));
    expect(r).toMatchObject({ novas: 1, alteradas: 0, removidas: 0 });
    expect(r.linhas).toEqual([linha("b2", 200)]);
  });

  it("baixa que saiu vira estorno: débito e crédito trocados, na mesma data", () => {
    const r = correcaoEntre(estadoDasLinhas([linha("b1", 1000), linha("b2", 200)]), estadoDasLinhas([linha("b1", 1000)]));
    expect(r).toMatchObject({ novas: 0, alteradas: 0, removidas: 1 });
    expect(r.linhas).toEqual([{ ...linha("b2", 200), debito: "7", credito: "341", complemento: "ESTORNO PAGTO b2" }]);
  });

  it("baixa que mudou: estorno do que foi e as linhas de agora", () => {
    const r = correcaoEntre(estadoDasLinhas([linha("b1", 1000)]), estadoDasLinhas([linha("b1", 1200)]));
    expect(r).toMatchObject({ novas: 0, alteradas: 1, removidas: 0 });
    expect(r.linhas).toEqual([estorno(linha("b1", 1000)), linha("b1", 1200)]);
  });

  it("a conta do de-para trocada também conta como mudança", () => {
    const r = correcaoEntre(estadoDasLinhas([linha("b1", 1000)]), estadoDasLinhas([linha("b1", 1000, { debito: "342" })]));
    expect(r.alteradas).toBe(1);
  });

  it("as linhas saem na ordem da data", () => {
    const r = correcaoEntre({}, estadoDasLinhas([linha("b2", 1, { dataKey: "2026-10-20" }), linha("b1", 1, { dataKey: "2026-10-03" })]));
    expect(r.linhas.map((l) => l.dataKey)).toEqual(["2026-10-03", "2026-10-20"]);
  });
});
