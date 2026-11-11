import { describe, expect, it } from "vitest";
import { dicaDaLinha } from "./dicasDaDre";
import { MODELO_POR_AREA } from "./estruturaPorArea";
import { modeloDoCodigo } from "./estrutura";

describe("dicaDaLinha", () => {
  it("explica as siglas e a margem", () => {
    expect(dicaDaLinha("cmv")).toMatch(/custo da mercadoria vendida/);
    expect(dicaDaLinha("ebitda")).toMatch(/^EBITDA/);
    expect(dicaDaLinha("margem_contribuicao")).toMatch(/despesas fixas/);
  });

  it("a linha de percentual usa a frase da linha dela", () => {
    expect(dicaDaLinha("cmv_pct")).toBe(`${dicaDaLinha("cmv")} Aqui, em porcentagem das vendas.`);
  });

  it("linha sem frase fica sem dica", () => {
    expect(dicaDaLinha("linha_que_nao_existe")).toBeUndefined();
    expect(dicaDaLinha("linha_que_nao_existe_pct")).toBeUndefined();
  });

  it("os números do topo dos dois modelos têm dica", () => {
    for (const modelo of [MODELO_POR_AREA, modeloDoCodigo(null)]) {
      for (const code of ["receita_bruta", "margem_contribuicao", modelo.linhaOperacional, modelo.linhaDoResultado]) {
        expect(dicaDaLinha(code), `${modelo.codigo}: ${code}`).toBeTruthy();
      }
    }
  });
});
