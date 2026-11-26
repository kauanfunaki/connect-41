import { describe, expect, it } from "vitest";
import { descreverAlteracao, lerAlteracao } from "./alteracaoEmLote";

describe("alteração em lote", () => {
  it("lê o campo e o valor do seletor", () => {
    expect(lerAlteracao("HORARIO:h1")).toEqual({ ok: true, alteracao: { campo: "HORARIO", horarioId: "h1" } });
    expect(lerAlteracao("CENTRO:")).toEqual({ ok: true, alteracao: { campo: "CENTRO", costCenterId: null } });
    expect(lerAlteracao("VALE_TRANSPORTE:sim")).toEqual({ ok: true, alteracao: { campo: "VALE_TRANSPORTE", ligado: true } });
    expect(lerAlteracao("CONTRIBUICAO_SINDICAL:nao")).toEqual({ ok: true, alteracao: { campo: "CONTRIBUICAO_SINDICAL", ligado: false } });
    expect(lerAlteracao("HORARIO:")).toMatchObject({ ok: false });
    expect(lerAlteracao("VALE_TRANSPORTE:talvez")).toMatchObject({ ok: false });
    expect(lerAlteracao("")).toMatchObject({ ok: false });
  });

  it("descreve a mudança", () => {
    expect(descreverAlteracao({ campo: "CENTRO", costCenterId: null })).toBe("Centro de custo: sem centro de custo");
    expect(descreverAlteracao({ campo: "HORARIO", horarioId: "h1" }, () => "Comercial 44 h")).toBe("Horário de trabalho: Comercial 44 h");
    expect(descreverAlteracao({ campo: "VALE_TRANSPORTE", ligado: false })).toBe("Vale-transporte: não");
  });
});
