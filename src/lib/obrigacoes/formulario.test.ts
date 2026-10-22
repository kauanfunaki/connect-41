import { describe, expect, it } from "vitest";
import { lerModeloDoForm } from "./formulario";

function form(campos: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
}

const BASE = { nome: "DAS", pipelineId: "p1", periodicidade: "MENSAL", mesesAposCompetencia: "1", tipoDoDia: "DIA", diaLegal: "20" };

describe("lerModeloDoForm", () => {
  it("lê as datas e a regra", () => {
    const r = lerModeloDoForm(
      form({ ...BASE, ajuste: "ANTECIPAR", diasUteisAntes: "2", regimes: ["SIMPLES_NACIONAL", "XPTO"], estados: "sp, mg", cidades: "São Paulo; Mogi das Cruzes", semMovimento: "NAO", exigeSetorContratado: "on" })
    );
    expect(r).toEqual({
      dados: {
        nome: "DAS",
        descricao: null,
        pipelineId: "p1",
        datas: { periodicidade: "MENSAL", mesesAposCompetencia: 1, diaLegal: 20, diasUteisAntes: 2, ajuste: "ANTECIPAR" },
        aplicacao: {
          regimes: ["SIMPLES_NACIONAL"],
          semMovimento: "NAO",
          comFuncionarios: "QUALQUER",
          estados: ["SP", "MG"],
          cidades: ["São Paulo", "Mogi das Cruzes"],
          exigeSetorContratado: true,
        },
      },
    });
  });

  it("último dia útil não tem dia legal", () => {
    const r = lerModeloDoForm(form({ ...BASE, tipoDoDia: "ULTIMO_DIA_UTIL", diaLegal: "" }));
    expect("dados" in r && r.dados.datas.diaLegal).toBeNull();
  });

  it("recusa o que não dá para gerar", () => {
    expect(lerModeloDoForm(form({ ...BASE, nome: "" }))).toEqual({ error: expect.stringMatching(/nome/) });
    expect(lerModeloDoForm(form({ ...BASE, diaLegal: "32" }))).toEqual({ error: expect.stringMatching(/dia legal/) });
    expect(lerModeloDoForm(form({ ...BASE, mesesAposCompetencia: "30" }))).toEqual({ error: expect.stringMatching(/24/) });
    expect(lerModeloDoForm(form({ ...BASE, estados: "SP, XX" }))).toEqual({ error: expect.stringMatching(/XX/) });
  });

  it("a prévia roda sem nome e sem kanban", () => {
    expect("dados" in lerModeloDoForm(form({ ...BASE, nome: "", pipelineId: "" }), false)).toBe(true);
  });
});
